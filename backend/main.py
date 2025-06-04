from fastapi import FastAPI, Depends, HTTPException, Request, status, UploadFile, File, Query, Response
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from typing import List
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from fastapi.responses import JSONResponse

from schemas import (UserCreate, UserResponse, LoginRequest, CarCreate,
                    CarResponse, CarBase, CarUpdate, UserUpdate, QuizQuestionOut,
                    QuizOptionOut, QuizSubmitRequest, QuizSubmitResponse, RewardResponse,
                    UserRewardResponse, UserRewardCreate, DrivingSessionBase,
                    DrivingSessionCreate, DrivingSessionResponse, PhotoUploadResponse)

from models import (User, Car, QuizQuestion, QuizOption, 
                    Reward, UserReward, DrivingSession, PhotoUpload)

from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from repository import create_user, get_user, get_user_cars, create_car, grade_quiz
from db import init_db, SessionLocal
import os
import time
from pathlib import Path

app = FastAPI()


UPLOAD_DIR = os.path.join(os.getcwd(), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

UPLOAD_PHOTO_DIR = os.path.join(UPLOAD_DIR, "photos")
os.makedirs(UPLOAD_PHOTO_DIR, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.mount(
    "/static",
    StaticFiles(directory="static", html=False),
    name="static",
)
# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
        
@app.post("/login")
def login_user(credentials: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    
    if not pwd_context.verify(credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    
    return {"message": "Login successful", "user_id": user.id, "firstname": user.firstname}

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print("⚠️ Validation Error:")
    print(exc.errors())
    return await request_validation_exception_handler(request, exc)

@app.post("/register", response_model=UserResponse)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")
    new_user = create_user(db, user)
    return new_user

@app.get("/users/{user_id}", response_model=UserResponse)
def read_user(user_id: int, db: Session = Depends(get_db)):
    user = get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.put("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_in: UserUpdate,
    db: Session = Depends(get_db),
):
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(404, "User not found")
    for field, value in user_in.dict(exclude_unset=True).items():
        setattr(db_user, field, value)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/users/{user_id}/avatar", response_model=UserResponse)
async def upload_avatar(
    user_id: int,
    avatar: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # make sure the folder exists
    avatars_dir = Path("static/avatars")
    avatars_dir.mkdir(parents=True, exist_ok=True)

    # save the file as e.g. 10.webp
    ext = Path(avatar.filename).suffix or ".webp"
    filename = f"{user_id}{ext}"
    dest = avatars_dir / filename

    with open(dest, "wb") as f:
        f.write(await avatar.read())

    # update the user record
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(404, "User not found")
    db_user.avatar_url = f"/static/avatars/{filename}"
    db.commit()
    db.refresh(db_user)

    return db_user

@app.get("/users/{user_id}/cars", response_model=List[CarResponse])
def read_cars_for_user(user_id: int, db: Session = Depends(get_db)):
    # optionally ensure the user exists:
    if not get_user(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return get_user_cars(db, user_id)

@app.post(
    "/cars",
    response_model=CarResponse,
    status_code=status.HTTP_201_CREATED
)
def add_car(car: CarCreate, db: Session = Depends(get_db)):
    # verify that the user exists
    if not get_user(db, car.user_id):
        raise HTTPException(status_code=404, detail="User not found")
    # create and return the new Car
    return create_car(db, car)

@app.put("/cars/{car_id}", response_model=CarResponse)
def update_car(
    car_id: int,
    car_in: CarUpdate,          # or CarBase if you don't want user_id here
    db: Session = Depends(get_db),
):
    # query the ORM model
    db_car = db.query(Car).filter(Car.id == car_id).first()
    if not db_car:
        raise HTTPException(status_code=404, detail="Car not found")

    # update fields
    for field, value in car_in.dict().items():
        setattr(db_car, field, value)
    db.commit()
    db.refresh(db_car)
    return db_car

@app.delete("/cars/{car_id}", status_code=204)
def delete_car(car_id: int, db: Session = Depends(get_db)):
    db_car = db.query(Car).get(car_id)
    if not db_car:
        raise HTTPException(404, "Car not found")
    db.delete(db_car)
    db.commit()

@app.get("/rewards", response_model=List[RewardResponse])
def list_rewards(db: Session = Depends(get_db)):
    return db.query(Reward).all()

@app.post("/user_rewards", response_model=UserRewardResponse)
def claim_reward(payload: UserRewardCreate, db: Session = Depends(get_db)):
    # ensure user & reward exist and user has enough points
    user = db.query(User).get(payload.user_id)
    reward = db.query(Reward).get(payload.reward_id)
    if not user or not reward:
        raise HTTPException(404, "User or Reward not found")
    if user.points < reward.cost_points:
        raise HTTPException(400, "Not enough points")
    # deduct points
    user.points -= reward.cost_points
    ur = UserReward(user_id=user.id, reward_id=reward.id)
    db.add(ur)
    db.commit()
    db.refresh(ur)
    return ur

@app.get("/users/{user_id}/rewards", response_model=List[UserRewardResponse])
def list_user_rewards(
    user_id: int,
    db: Session = Depends(get_db),
):
    # optional: verify user exists
    if not db.query(User).filter(User.id == user_id).first():
        raise HTTPException(status_code=404, detail="User not found")
    return (
        db.query(UserReward)
          .filter(UserReward.user_id == user_id)
          .all()
    )

@app.get("/quiz", response_model=List[QuizQuestionOut])
def get_all_quiz_questions(db: Session = Depends(get_db)):
    questions = db.query(QuizQuestion).all()
    return questions

@app.post("/quiz/submit", response_model=QuizSubmitResponse)
def submit_quiz(
    payload: QuizSubmitRequest,
    db: Session = Depends(get_db)
):
    # ensure user exists
    if not get_user(db, payload.user_id):
        raise HTTPException(404, "User not found")
    result = grade_quiz(db, payload.user_id, [a.dict() for a in payload.answers])
    return result


@app.post(
    "/drive_records/",
    response_model=DrivingSessionResponse,
    status_code=201
)
async def create_drive_record(
    user_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload a new driving video file for a user, save it on disk,
    and record a DriveRecord row. Returns the saved record.
    """

    # 1) Validate that the user actually exists
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # 2) Make sure the incoming file is a video (simple check by extension)
    filename = file.filename or "upload"
    extension = os.path.splitext(filename)[1].lower()
    if extension not in [".mp4", ".mov", ".avi", ".mkv"]:
        raise HTTPException(status_code=400, detail="Unsupported video format")

    # 3) Construct a safe filepath
    # e.g. "uploads/drive_{user_id}_{timestamp}.mp4"
    import time
    timestamp = int(time.time() * 1000)
    safe_name = f"drive_{user_id}_{timestamp}{extension}"
    dest_path = os.path.join(UPLOAD_DIR, safe_name)

    # 4) Write the uploaded file to disk
    try:
        with open(dest_path, "wb") as buffer:
            content = await file.read()  # read() returns bytes
            buffer.write(content)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to save file: {str(e)}"
        )

    # 5) Create a new DriveRecord in the DB
    new_record = DrivingSession(
        user_id=user_id,
        file_path=dest_path,
        # created_at defaults to NOW()
        # points_awarded defaults to 0
    )
    db.add(new_record)
    db.commit()
    db.refresh(new_record)

    # 6) Return the newly created record
    return new_record

# ─────────── Ny endpoint för fotouppladdning ───────────

@app.post(
    "/photo_upload/",
    response_model=PhotoUploadResponse,
    status_code=status.HTTP_201_CREATED
)
async def upload_photo_for_user(
    user_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Ta emot en bild (jpg, jpeg eller png) för en användare, spara den i uploads/photos/,
    och skapa en rad i photo_uploads-tabellen.
    """
    # 1) Kontrollera att användaren finns
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # 2) Kontrollera att filen är en bild
    filename = file.filename or "upload"
    extension = os.path.splitext(filename)[1].lower()
    if extension not in [".jpg", ".jpeg", ".png"]:
        raise HTTPException(status_code=400, detail="Unsupported image format")

    # 3) Sätt upp en katalog för bilder och skapa ett säkert filnamn
    timestamp = int(time.time() * 1000)
    safe_name = f"photo_{user_id}_{timestamp}{extension}"
    os.makedirs(UPLOAD_PHOTO_DIR, exist_ok=True)
    dest_path = os.path.join(UPLOAD_PHOTO_DIR, safe_name)

    # 4) Spara bilden på disk
    try:
        with open(dest_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to save image: {str(e)}"
        )

    # 5) Skapa en ny PhotoUpload-rad i DB
    new_photo = PhotoUpload(
        user_id=user_id,
        file_path=dest_path
    )
    db.add(new_photo)
    db.commit()
    db.refresh(new_photo)

    # 6) Returnera den nyskapade raden
    return new_photo

# ─── 2) NY: GET /photo_uploads/?user_id=<id> ─────────────────────────
@app.get(
    "/photo_uploads/",
    response_model=List[PhotoUploadResponse],
    status_code=status.HTTP_200_OK
)
def list_photos_for_user(
    user_id: int = Query(..., description="ID of the user"),
    db: Session = Depends(get_db)
):
    """
    Returnerar en lista med alla PhotoUpload-poster för en given user_id.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    photos = db.query(PhotoUpload).filter(PhotoUpload.user_id == user_id).all()
    return photos

@app.delete("/photo_upload/{photo_id}", status_code=204)
def delete_photo(photo_id: int, db: Session = Depends(get_db)):
    photo = db.query(PhotoUpload).filter(PhotoUpload.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    # Ta bort filen från disk
    try:
        os.remove(photo.file_path)
    except OSError:
        pass
    # Ta bort posten i databasen
    db.delete(photo)
    db.commit()
    return Response(status_code=204)


@app.on_event("startup")
def startup_event():
    init_db()

@app.get("/")
def root():
    return {"message": "SafeDrive backend is running 🚗"}

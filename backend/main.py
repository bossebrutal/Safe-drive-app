from fastapi import FastAPI, Depends, HTTPException, Request, status, UploadFile, File, Query, Response, BackgroundTasks, APIRouter
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from typing import List
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from sqlalchemy import and_
from dotenv import load_dotenv
load_dotenv()
import logging
from fastapi.responses import JSONResponse, StreamingResponse, HTMLResponse
import io
import json
from schemas import (UserCreate, UserResponse, LoginRequest, CarCreate,
                    CarResponse, CarBase, CarUpdate, UserUpdate, QuizQuestionOut,
                    QuizOptionOut, QuizSubmitRequest, QuizSubmitResponse, RewardResponse,
                    UserRewardResponse, UserRewardCreate, DrivingSessionBase,
                    DrivingSessionCreate, DrivingSessionResponse, PhotoUploadResponse)

from models import (User, Car, QuizQuestion, QuizOption, 
                    Reward, UserReward, DrivingSession, PhotoUpload)

from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import FileResponse
from repository import create_user, get_user, get_user_cars, create_car, grade_quiz
from db import init_db, SessionLocal
import os, cv2, numpy as np, scipy.special
import time
from pathlib import Path
from collections import deque
from PIL import Image
import torchvision.transforms as T
import onnxruntime as ort
from collections import deque
import subprocess
from pydantic import BaseModel
from auth import create_access_token, verify_access_token
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
import random
import string
from datetime import datetime, timedelta
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
from pydantic import EmailStr



# Gloabal variable to track conversion status
conversion_status = {}
video_progress = {}
app = FastAPI()

lane_router = APIRouter()

DEPTH_SCALE = 2.680260
DEPTH_BOX_OFFSET = 7     # Y-offset (neråt)
DEPTH_BOX_OFFSET_X = 7  # X-offset (höger)
DEPTH_BOX_SIZE = 8 

conf = ConnectionConfig(
    MAIL_USERNAME = os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD"),
    MAIL_FROM = os.getenv("MAIL_FROM"),
    MAIL_PORT = int(os.getenv("MAIL_PORT", 587)),
    MAIL_SERVER = os.getenv("MAIL_SERVER"),
    MAIL_STARTTLS = os.getenv("MAIL_STARTTLS", "True") == "True",
    MAIL_SSL_TLS = os.getenv("MAIL_SSL_TLS", "False") == "True",
    USE_CREDENTIALS = True,
)

UPLOAD_DIR = os.path.join(os.getcwd(), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

UPLOAD_PHOTO_DIR = os.path.join(UPLOAD_DIR, "photos")
os.makedirs(UPLOAD_PHOTO_DIR, exist_ok=True)

app.mount("/docs/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.mount(
    "/docs/static",
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

# —————— ONNX runtime globals ——————
DEPTH_SESSION: ort.InferenceSession = None  # Will be set in startup event
depth_transform = T.Compose([
    T.Resize((192, 640)),  # Anpassa till din models input
    T.ToTensor(),
    T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

# —————— ONNX runtime setup ——————
SESSION: ort.InferenceSession = None  # Will be set in startup event
row_anchor = np.array([121, 131, 141, 150, 160, 170, 180, 189, 199, 209, 219, 228, 238, 248, 258, 267, 277, 287])   # your culane_row_anchor
col_sample  = np.linspace(0, 800-1, 200)
buffers     = [deque(maxlen=5) for _ in range(4)]
infer_transform = T.Compose([
    T.Resize((288,800)),
    T.ToTensor(),
    T.Normalize(mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225]),
])

def probe_duration(path: str) -> float:
    """Return video duration in seconds using ffprobe."""
    out = subprocess.check_output([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        path
    ])
    return float(out)

@app.on_event("startup")
def load_onnx():
    global SESSION, DEPTH_SESSION
    SESSION = ort.InferenceSession("../assets/models/lane_net.onnx", providers=["CPUExecutionProvider"])
    DEPTH_SESSION = ort.InferenceSession("../assets/models/monodepth2_kitti.onnx", providers=["CPUExecutionProvider"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/docs/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = verify_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.query(User).filter(User.id == payload.get("user_id")).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.post("/docs/login")
def login_user(credentials: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not pwd_context.verify(credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = create_access_token({"sub": user.email, "user_id": user.id})
    return {"access_token": token, "token_type": "bearer", "user_id": user.id, "firstname": user.firstname}

@app.get("/docs/protected")
def protected_route(current_user: User = Depends(get_current_user)):
    return {"message": f"Du är inloggad som {current_user.firstname}!"}

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print("⚠️ Validation Error:")
    print(exc.errors())
    return await request_validation_exception_handler(request, exc)

def generate_reset_code(length=6):
    return ''.join(random.choices(string.digits, k=length))

# Hjälpfunktion för att skicka e-post (byt ut mot riktig e-posttjänst i produktion)
async def send_reset_email(email: str, code: str):
    message = MessageSchema(
        subject="SafeDrive - Återställningskod",
        recipients=[email],
        body=f"Din återställningskod är: {code}\n\nKoden är giltig i 10 minuter.",
        subtype="plain"
    )
    fm = FastMail(conf)
    await fm.send_message(message)

# Endpoint: Initiera lösenordsåterställning
@app.post("/docs/forgot_password")
async def forgot_password(email: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    code = generate_reset_code()
    expires_at = datetime.utcnow() + timedelta(minutes=10)
    from models import PasswordResetCode
    reset_code = PasswordResetCode(
        user_id=user.id,
        code=code,
        expires_at=expires_at,
        used=False
    )
    db.add(reset_code)
    db.commit()
    background_tasks.add_task(send_reset_email, email, code)
    return {"message": "Verification code sent to your email."}

# Endpoint: Återställ lösenord
@app.post("/docs/reset_password")
def reset_password(email: str, code: str, new_password: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    from models import PasswordResetCode
    reset_code = db.query(PasswordResetCode).filter(
        and_(
            PasswordResetCode.user_id == user.id,
            PasswordResetCode.code == code,
            PasswordResetCode.expires_at > datetime.utcnow(),
            PasswordResetCode.used == False
        )
    ).first()
    if not reset_code:
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    # Uppdatera lösenord
    user.hashed_password = pwd_context.hash(new_password)
    db.commit()
    # Markera koden som använd
    reset_code.used = True
    db.commit()
    return {"message": "Password reset successful."}

@app.post("/docs/register", response_model=UserResponse)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")
    new_user = create_user(db, user)
    return new_user

@app.get("/docs/users/{user_id}", response_model=UserResponse)
def read_user(user_id: int, db: Session = Depends(get_db)):
    user = get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.put("/docs/users/{user_id}", response_model=UserResponse)
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

@app.post("/docs/add_points/")
def add_points(user_id: int, points: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.points += points
    db.commit()
    return {"success": True, "total_points": user.points}

@app.post("/docs/users/{user_id}/avatar", response_model=UserResponse)
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

@app.get("/docs/users/{user_id}/cars", response_model=List[CarResponse])
def read_cars_for_user(user_id: int, db: Session = Depends(get_db)):
    # optionally ensure the user exists:
    if not get_user(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return get_user_cars(db, user_id)

@app.post(
    "/docs/cars",
    response_model=CarResponse,
    status_code=status.HTTP_201_CREATED
)
def add_car(car: CarCreate, db: Session = Depends(get_db)):
    # verify that the user exists
    if not get_user(db, car.user_id):
        raise HTTPException(status_code=404, detail="User not found")
    # create and return the new Car
    return create_car(db, car)

@app.put("/docs/cars/{car_id}", response_model=CarResponse)
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

@app.delete("/docs/cars/{car_id}", status_code=204)
def delete_car(car_id: int, db: Session = Depends(get_db)):
    db_car = db.query(Car).get(car_id)
    if not db_car:
        raise HTTPException(404, "Car not found")
    db.delete(db_car)
    db.commit()

@app.get("/docs/rewards", response_model=List[RewardResponse])
def list_rewards(db: Session = Depends(get_db)):
    return db.query(Reward).all()

@app.post("/docs/user_rewards", response_model=UserRewardResponse)
def claim_reward(payload: UserRewardCreate, db: Session = Depends(get_db)):
    user = db.query(User).get(payload.user_id)
    reward = db.query(Reward).get(payload.reward_id)
    if not user or not reward:
        raise HTTPException(404, "User or Reward not found")
    if user.points < reward.cost_points:
        raise HTTPException(400, "Not enough points")
    user.points -= reward.cost_points
    claimed_at = datetime.utcnow()
    expires_at = claimed_at + timedelta(days=365)
    ur = UserReward(
        user_id=user.id,
        reward_id=reward.id,
        claimed_at=claimed_at,
        expires_at=expires_at,
        used=False,
        redeemed_at=None  # Initially not redeemed
    )
    db.add(ur)
    db.commit()
    db.refresh(ur)
    return ur

@app.get("/docs/users/{user_id}/rewards", response_model=List[UserRewardResponse])
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
@app.get("/docs/redeem", response_class=HTMLResponse)
def redeem_page(user_reward_id: int, user_id: int, reward_id: int, db: Session = Depends(get_db)):
    ur = db.query(UserReward).get(user_reward_id)
    if not ur or ur.user_id != user_id or ur.reward_id != reward_id:
        return "<h1 style='font-size:2.5rem;text-align:center;'>Ogiltig eller redan använd reward!</h1>"
    reward = db.query(Reward).get(reward_id)
    if ur.used:
        return "<h1 style='font-size:2.5rem;text-align:center;'>Denna reward är redan använd!</h1>"
    return f"""
    <html>
    <head>
    <title>Redeem Reward</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{
            font-family: sans-serif;
            background: #f7f7f7;
            color: #222;
            font-size: 2.2rem;
        }}
        .container {{
            max-width: 900px;
            margin: 80px auto;
            background: #fff;
            border-radius: 24px;
            padding: 64px 24px 48px 24px;
            box-shadow: 0 8px 32px #0003;
        }}
        h1 {{
            color: #8DA46D;
            font-size: 3.2rem;
            margin-bottom: 2.5rem;
            text-align: center;
        }}
        p {{
            margin-bottom: 2.2rem;
            font-size: 2rem;
            text-align: center;
        }}
        .btn {{
            display: inline-block;
            padding: 32px 64px;
            margin: 32px 24px 0 0;
            border: none;
            border-radius: 16px;
            font-size: 2.2rem;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.2s, transform 0.1s;
            box-shadow: 0 2px 8px #0002;
        }}
        .btn:active {{
            transform: scale(0.97);
        }}
        .redeem {{
            background: #8DA46D;
            color: #fff;
        }}
        .redeem:hover {{
            background: #6d8a54;
        }}
        .cancel {{
            background: #ccc;
            color: #222;
        }}
        .cancel:hover {{
            background: #aaa;
        }}
        @media (max-width: 600px) {{
            .container {{
                padding: 32px 4vw 24px 4vw;
            }}
            h1 {{
                font-size: 2.2rem;
            }}
            .btn {{
                font-size: 1.5rem;
                padding: 20px 10vw;
            }}
            p {{
                font-size: 1.2rem;
            }}
        }}
    </style>
    </head>
    <body>
    <div class="container">
        <h1>{reward.title}</h1>
        <p><b>Beskrivning:</b> {reward.description or "Ingen beskrivning"}</p>
        <p><b>Plats:</b> {reward.location or "Valfri partner"}</p>
        <p><b>Giltig till:</b> {ur.expires_at.strftime('%Y-%m-%d') if ur.expires_at else "Okänt"}</p>
        <form method="post" action="/docs/redeem/{user_reward_id}" style="text-align:center;">
            <button class="btn redeem" type="submit">🎉 Redeem Reward!</button>
            <button class="btn cancel" type="button" onclick="window.location.href='safedriveapp://profile'">Avbryt</button>
        </form>
    </div>
    </body>
    </html>
    """

@app.post("/docs/redeem/{user_reward_id}", response_class=HTMLResponse)
def redeem_action(user_reward_id: int, db: Session = Depends(get_db)):
    ur = db.query(UserReward).get(user_reward_id)
    if not ur or ur.used:
        return "<h1 style='font-size:2.5rem;text-align:center;'>Reward already used or not found!</h1>"
    ur.used = True
    ur.redeemed_at = datetime.utcnow()
    db.commit()
    return """
    <html>
    <head>
      <title>Reward Redeemed</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: sans-serif;
          background: #f7f7f7;
          color: #222;
          font-size: 2.2rem;
        }
        .container {
          max-width: 900px;
          margin: 80px auto;
          background: #fff;
          border-radius: 24px;
          padding: 64px 24px 48px 24px;
          box-shadow: 0 8px 32px #0003;
          text-align: center;
        }
        h1 {
          color: #8DA46D;
          font-size: 3.2rem;
          margin-bottom: 2.5rem;
        }
        p {
          margin-bottom: 2.2rem;
          font-size: 2rem;
        }
        .btn {
          display: inline-block;
          padding: 32px 64px;
          margin: 32px 24px 0 0;
          border: none;
          border-radius: 16px;
          font-size: 2.2rem;
          font-weight: bold;
          cursor: pointer;
          transition: background 0.2s, transform 0.1s;
          box-shadow: 0 2px 8px #0002;
        }
        .btn:active {
          transform: scale(0.97);
        }
        .cancel {
          background: #ccc;
          color: #222;
        }
        .cancel:hover {
          background: #aaa;
        }
        @media (max-width: 600px) {
          .container {
            padding: 32px 4vw 24px 4vw;
          }
          h1 {
            font-size: 2.2rem;
          }
          .btn {
            font-size: 1.5rem;
            padding: 20px 10vw;
          }
          p {
            font-size: 1.2rem;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Reward redeemed!</h1>
        <p>Rewarden är nu använd.</p>
        <button class="btn cancel" type="button" onclick="window.location.href='safedriveapp://profile'">Tillbaka till appen</button>
      </div>
    </body>
    </html>
    """

@app.get("/docs/quiz", response_model=List[QuizQuestionOut])
def get_all_quiz_questions(db: Session = Depends(get_db)):
    questions = db.query(QuizQuestion).all()
    return questions

@app.post("/docs/quiz/submit", response_model=QuizSubmitResponse)
def submit_quiz(
    payload: QuizSubmitRequest,
    db: Session = Depends(get_db)
):
    # ensure user exists
    if not get_user(db, payload.user_id):
        raise HTTPException(404, "User not found")
    result = grade_quiz(db, payload.user_id, [a.dict() for a in payload.answers])
    return result

def perspective_warp(img, src_pts, dst_size, crop_bottom=0):
    """
    Warps the perspective of img from src_pts (4 points) to a rectangle of size dst_size (W, H).
    """
    W, H = dst_size
    dst_pts = np.float32([
        [0, H - crop_bottom],      # bottom-left
        [W, H - crop_bottom],      # bottom-right
        [W, 0],      # top-right
        [0, 0],      # top-left
    ])
    M = cv2.getPerspectiveTransform(src_pts, dst_pts)
    warped = cv2.warpPerspective(img, M, (W, H))
    return warped

def run_model_on_video(input_path: str, output_path: str, progress_key: str = None):
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open '{input_path}'")

    fps = cap.get(cv2.CAP_PROP_FPS) or 20

    # --- Model input/output sizes ---
    ROI_W = 1640
    ROI_H = 590                  # Try 480 or higher

    KB = 11
    NUM_LANES = 4  # or whatever your model expects
    buffers = [deque(maxlen=KB) for _ in range(NUM_LANES)]


    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_path, fourcc, fps, (ROI_W, ROI_H))

    logger = logging.getLogger("uvicorn")
    logger.info(f"Starting conversion: {input_path} → {output_path}")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_idx = 0
    redline_times = []
    while True:
        ret, frame_bgr = cap.read()
        if not ret or frame_bgr is None:
            break
        frame_idx += 1

        # 1) Apply distortion to the full frame
        frame_h, frame_w = frame_bgr.shape[:2]

        # 1) Define your source points (adjust as needed)
        src_pts = np.float32([
        [frame_w * 0.0, frame_h * 0.88],    # bottom-left
        [frame_w * 1.0, frame_h * 0.88],    # bottom-right
        [frame_w * 1.0, frame_h * 0.37],     # top-right
        [frame_w * 0.0, frame_h * 0.37],     # top-left
        ])

        # 2) Define output size (same as ROI_W, ROI_H)
        dst_size = (ROI_W, ROI_H)

        # 3) Apply perspective warp
        warped = perspective_warp(frame_bgr, src_pts, dst_size, crop_bottom=-40)

        # 4) Use 'warped' instead of 'roi' for further processing
        roi_resized = warped  # Already the right size

        # --- Visual debugging: save the first ROI frame ---
        if frame_idx == 1:
            cv2.imwrite("debug_roi.jpg", roi_resized)
        # --- end visual debugging ---

        # 4) Preprocess for ONNX/model
        orig_h, orig_w = roi_resized.shape[:2]
        pil = Image.fromarray(cv2.cvtColor(roi_resized, cv2.COLOR_BGR2RGB))
        x = infer_transform(pil).unsqueeze(0).numpy()

        # 5) Model inference
        outp = SESSION.run(None, {"input": x})[0]    # shape (1,201,18,4)
        logits = outp[0][:, ::-1, :]                 # flip Y

        prob = scipy.special.softmax(logits[:-1], axis=0)
        idx = (np.arange(col_sample.shape[0]) + 1).reshape(-1,1,1)
        loc = np.sum(prob * idx, axis=0)
        argm = np.argmax(logits, axis=0)
        loc[argm == col_sample.shape[0]] = 0

        for lane in range(len(buffers)):
            buffers[lane].append(loc[:, lane].copy())
            # Stack buffer and ignore zeros for median
            arr = np.stack(buffers[lane], axis=0)
            # Mask zeros
            arr_masked = np.where(arr == 0, np.nan, arr)
            loc[:, lane] = np.nanmedian(arr_masked, axis=0)
            # If all are nan, fallback to original
            loc[:, lane][np.isnan(loc[:, lane])] = loc[:, lane][np.isnan(loc[:, lane])]

        # 6) Draw overlays
        img_bgr = roi_resized.copy()
        sx = orig_w / 800.0
        sy = orig_h / 288.0
        red_lines_this_frame = 0
        for lane in range(loc.shape[1]):
            pts = []
            for r in range(loc.shape[0]):
                xbin = loc[r, lane]
                if xbin > 0:
                    px = int(xbin * (col_sample[1] - col_sample[0]) * sx)
                    py = int(row_anchor[loc.shape[0]-1-r] * sy)
                    pts.append((px, py))
                    cv2.circle(img_bgr, (px,py), 3, (255,0,255), -1)
            if len(pts) >= 5:  # Need enough points for a good fit
                pts_np = np.array(pts)
                # Fit a 2nd degree polynomial (quadratic curve): x = f(y)
                z = np.polyfit(pts_np[:,1], pts_np[:,0], 2)
                f = np.poly1d(z)
                y_new = np.linspace(pts_np[:,1].min(), pts_np[:,1].max(), 50)
                x_new = f(y_new)
                curve_pts = np.array([x_new, y_new], dtype=np.int32).T

                # Color logic
                mid_x, limit_y = int(orig_w * 0.48), int(orig_h * 0.4)
                sx0, sy0 = pts[0]
                col = (0,255,0) if (sx0 >= mid_x and sy0 >= limit_y) else (0,0,255)

                if col == (0,0,255) and sx0 < mid_x:  # left of car and red
                    red_lines_this_frame += 1

                cv2.polylines(img_bgr, [curve_pts], False, col, 2)
            elif len(pts) >= 2:
                # Color logic
                mid_x, limit_y = int(orig_w * 0.48), int(orig_h * 0.4)
                sx0, sy0 = pts[0]
                col = (0,255,0) if (sx0 >= mid_x and sy0 >= limit_y) else (0,0,255)

                if col == (0,0,255) and sx0 < mid_x:  # left of car and red
                    red_lines_this_frame += 1

                for i in range(len(pts)-1):
                    cv2.line(img_bgr, pts[i], pts[i+1], col, 2)

        # ... draw lane overlays on img_bgr ...
        if red_lines_this_frame >= 2:
            redline_times.append(frame_idx / fps)

        out.write(img_bgr)

        if progress_key:
            video_progress[progress_key] = frame_idx / total_frames

        if frame_idx % 50 == 0:
            logger.info(f"Processed {frame_idx} frames…")

    if progress_key:
        video_progress[progress_key] = 1.0  # 100% done

    logger.info(f"Red lines detected in {len(redline_times)} frames")
    json_path = output_path.replace('.mp4', '_redlines.json')
    with open(json_path, 'w') as f:
        json.dump(redline_times, f)

    cap.release()
    out.release()
    logger.info(f"Finished conversion of {input_path}")

# ─── 1) NY: POST /convert_video/ ──────────────────────────────────────


def run_conversion_and_update_status(inp, outp, out_filename):
    try:
        progress_key = out_filename
        run_model_on_video(inp, outp, progress_key=progress_key)
        dur = probe_duration(outp)
        conversion_status[out_filename] = {"status": "done", "duration": dur}
        video_progress[progress_key] = 1.0
    except Exception as e:
        conversion_status[out_filename] = {"status": "error", "error": str(e)}
        video_progress[progress_key] = -1

live_buffers = [deque(maxlen=5) for _ in range(4)]


@lane_router.post("/docs/lane_overlay/")
async def lane_overlay(file: UploadFile = File(...)):
    """
    Tar emot en bild, kör lane-detection med ONNX-modellen och returnerar bilden med overlay.
    """
    # Läs in bilden från klienten
    content = await file.read()
    np_img = np.frombuffer(content, np.uint8)
    frame_bgr = cv2.imdecode(np_img, cv2.IMREAD_COLOR)

    if frame_bgr is None:
        raise HTTPException(status_code=400, detail="Kunde inte läsa bilden.")

    start = time.perf_counter()

    frame_h, frame_w = frame_bgr.shape[:2]

    src_pts_live = np.float32([
        [frame_w * 0.0, frame_h * 0.88],    # bottom-left
        [frame_w * 1.0, frame_h * 0.88],    # bottom-right
        [frame_w * 1.0, frame_h * 0.37],     # top-right
        [frame_w * 0.0, frame_h * 0.37],     # top-left
    ])
    dst_size_live = (1640, 590)
    warped = perspective_warp(frame_bgr, src_pts_live, dst_size_live, crop_bottom=0)

    # --- Preprocess för ONNX ---
    pil = Image.fromarray(cv2.cvtColor(warped, cv2.COLOR_BGR2RGB))
    x = infer_transform(pil).unsqueeze(0).numpy()

    # --- Modell-inferens ---
    outp = SESSION.run(None, {"input": x})[0]    # shape (1,201,18,4)
    if SESSION is None:
        raise HTTPException(status_code=500, detail="Modellen är inte laddad.")
    infer_time = (time.perf_counter() - start) * 1000  # ms
    logging.info(f"Inference time: {infer_time:.2f} ms")
    logits = outp[0][:, ::-1, :]                 # flip Y

    prob = scipy.special.softmax(logits[:-1], axis=0)
    idx = (np.arange(col_sample.shape[0]) + 1).reshape(-1,1,1)
    loc = np.sum(prob * idx, axis=0)
    argm = np.argmax(logits, axis=0)
    loc[argm == col_sample.shape[0]] = 0

    # --- Rita overlay på bilden ---
    img_overlay = warped.copy()
    orig_h, orig_w = img_overlay.shape[:2]
    sx = orig_w / 800.0
    sy = orig_h / 288.0
    num_red_lines = 0
    for lane in range(loc.shape[1]):
            pts = []
            for r in range(loc.shape[0]):
                xbin = loc[r, lane]
                if xbin > 0:
                    px = int(xbin * (col_sample[1] - col_sample[0]) * sx)
                    py = int(row_anchor[loc.shape[0]-1-r] * sy)
                    pts.append((px, py))
                    cv2.circle(img_overlay, (px,py), 3, (255,0,255), -1)
            
            # Buffer/median per lane
            live_buffers[lane].append(loc[:, lane].copy())
            arr = np.stack(live_buffers[lane], axis=0)
            arr_masked = np.where(arr == 0, np.nan, arr)
            loc[:, lane] = np.nanmedian(arr_masked, axis=0)
            loc[:, lane][np.isnan(loc[:, lane])] = loc[:, lane][np.isnan(loc[:, lane])]
            if len(pts) >= 5:  # Need enough points for a good fit
                pts_np = np.array(pts)
                # Fit a 2nd degree polynomial (quadratic curve): x = f(y)
                z = np.polyfit(pts_np[:,1], pts_np[:,0], 2)
                f = np.poly1d(z)
                y_new = np.linspace(pts_np[:,1].min(), pts_np[:,1].max(), 50)
                x_new = f(y_new)
                curve_pts = np.array([x_new, y_new], dtype=np.int32).T

                # Color logic
                mid_x, limit_y = int(orig_w * 0.48), int(orig_h * 0.4)
                sx0, sy0 = pts[0]
                col = (0,255,0) if (sx0 >= mid_x and sy0 >= limit_y) else (0,0,255)
                if col == (0,0,255):
                    num_red_lines += 1
                cv2.polylines(img_overlay, [curve_pts], False, col, 2)
            elif len(pts) >= 2:
                # Color logic
                mid_x, limit_y = int(orig_w * 0.48), int(orig_h * 0.4)
                sx0, sy0 = pts[0]
                col = (0,255,0) if (sx0 >= mid_x and sy0 >= limit_y) else (0,0,255)
                if col == (0,0,255):
                    num_red_lines += 1
                for i in range(len(pts)-1):
                    cv2.line(img_overlay, pts[i], pts[i+1], col, 2)
    
    print(f"Detected {num_red_lines} red lines in this frame.")
    # --- Returnera bilden som JPEG ---
    _, img_encoded = cv2.imencode('.jpg', img_overlay)
    headers = {"X-Red-Lines": str(num_red_lines)}
    return Response(content=img_encoded.tobytes(), media_type="image/jpeg", headers=headers)

# Registrera routern i din app
app.include_router(lane_router)

@app.post("/docs/convert_video/")
def convert_video(session_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    sess = db.query(DrivingSession).get(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")

    inp  = os.path.join(UPLOAD_DIR, sess.file_path)
    base, _ = os.path.splitext(sess.file_path)
    timestamp = int(time.time() * 1000)
    out_filename = f"marked_{base}_{timestamp}.mp4"
    outp = os.path.join(UPLOAD_DIR, out_filename)

    # Mark as processing
    conversion_status[out_filename] = {"status": "processing"}
    # Start background task
    background_tasks.add_task(run_conversion_and_update_status, inp, outp, out_filename)

    return {"marked_video_path": out_filename, "status": "processing"}

@app.post("/docs/depth_map/")
async def depth_map(file: UploadFile = File(...)):
    """
    Tar emot en bild, kör depth-prediktion med ONNX-modellen och returnerar depth map (meter) som PNG.
    """
    content = await file.read()
    np_img = np.frombuffer(content, np.uint8)
    frame_bgr = cv2.imdecode(np_img, cv2.IMREAD_COLOR)

    if frame_bgr is None:
        raise HTTPException(status_code=400, detail="Kunde inte läsa bilden.")

    pil = Image.fromarray(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
    x = depth_transform(pil).unsqueeze(0).numpy()

    if DEPTH_SESSION is None:
        raise HTTPException(status_code=500, detail="Depth-modellen är inte laddad.")
    disp = DEPTH_SESSION.run(None, {"input": x})[0]
    disp = disp.squeeze()

    # Omvandla till depth (meter)
    depth = DEPTH_SCALE / (disp + 1e-6)

    # Normalisera depth till 0-255 för PNG (valfritt: invertera så att nära är ljusare)
    depth_norm = (255 * (depth - depth.min()) / (depth.max() - depth.min() + 1e-8)).astype(np.uint8)
    depth_color = cv2.applyColorMap(depth_norm, cv2.COLORMAP_VIRIDIS)

    # ...existing code in depth_map...

    # Rita ut rutan i mitten (20x20 pixlar)
    h, w = depth.shape
    x1 = w//2 - DEPTH_BOX_SIZE//2 + DEPTH_BOX_OFFSET_X
    y1 = h//2 - DEPTH_BOX_SIZE//2 + DEPTH_BOX_OFFSET
    x2 = w//2 + DEPTH_BOX_SIZE//2 + DEPTH_BOX_OFFSET_X
    y2 = h//2 + DEPTH_BOX_SIZE//2 + DEPTH_BOX_OFFSET
    cv2.rectangle(depth_color, (x1, y1), (x2, y2), (0,255,0), 2)

    _, img_encoded = cv2.imencode('.png', depth_color)
    return Response(content=img_encoded.tobytes(), media_type="image/png")

@app.post("/docs/depth_map_raw/")
async def depth_map_raw(file: UploadFile = File(...)):
    content = await file.read()
    np_img = np.frombuffer(content, np.uint8)
    frame_bgr = cv2.imdecode(np_img, cv2.IMREAD_COLOR)
    if frame_bgr is None:
        raise HTTPException(status_code=400, detail="Kunde inte läsa bilden.")

    pil = Image.fromarray(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
    x = depth_transform(pil).unsqueeze(0).numpy()

    if DEPTH_SESSION is None:
        raise HTTPException(status_code=500, detail="Depth-modellen är inte laddad.")
    disp = DEPTH_SESSION.run(None, {"input": x})[0]
    disp = disp.squeeze()
    depth = DEPTH_SCALE / (disp + 1e-6)  # meter
    depth_list = depth.tolist()

    print("disp min:", disp.min(), "max:", disp.max(), "mean:", disp.mean())
    print("depth min:", depth.min(), "max:", depth.max(), "mean:", depth.mean())

    return {"depth": depth_list}


@app.get("/docs/conversion_progress/")
def get_conversion_progress(marked_video_path: str):
    progress = video_progress.get(marked_video_path)
    if progress is None:
        return {"progress": 0.0}
    return {"progress": progress}

@app.get("/docs/conversion_status/")
def get_conversion_status(marked_video_path: str):
    return conversion_status.get(marked_video_path, {"status": "not_found"})

@app.post(
    "/docs/driving_sessions/",
    response_model=DrivingSessionResponse,
    status_code=201
)
async def create_drive_record(
    user_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
  
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
        file_path=safe_name,
        # created_at defaults to NOW()
        # points_awarded defaults to 0
    )
    db.add(new_record)
    db.commit()
    db.refresh(new_record)

    fullpath = os.path.join(UPLOAD_DIR, new_record.file_path)
    dur = probe_duration(fullpath)
    new_record.duration = dur
    db.commit()
    db.refresh(new_record)

    return new_record



@app.get(
    "/docs/driving_sessions/",
    response_model=List[DrivingSessionResponse],
    status_code=200,
)
def list_drive_records(
    user_id: int = Query(..., description="ID of the user"),
    db: Session = Depends(get_db),
):
    """
    Return all driving sessions for a given user.
    """
    # 1) verify user exists
    if not db.query(User).filter(User.id == user_id).first():
        raise HTTPException(404, "User not found")

    # 2) query sessions
    sessions = (
        db.query(DrivingSession)
          .filter(DrivingSession.user_id == user_id)
          .order_by(DrivingSession.start_time.desc())
          .all()
    )
    return sessions

@app.delete("/docs/driving_sessions/{session_id}", status_code=204)
def delete_driving_session(session_id: int, db: Session = Depends(get_db)):
    session = db.query(DrivingSession).filter(DrivingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    # Remove video file from disk
    try:
        os.remove(os.path.join(UPLOAD_DIR, session.file_path))
        # Also remove marked video if it exists
        marked_path = os.path.join(UPLOAD_DIR, f"marked_{os.path.splitext(session.file_path)[0]}.mp4")
        if os.path.exists(marked_path):
            os.remove(marked_path)
    except OSError:
        pass
    db.delete(session)
    db.commit()
    return Response(status_code=204)

@app.post(
    "/docs/photo_upload/",
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
    "/docs/photo_uploads/",
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

@app.delete("/docs/photo_upload/{photo_id}", status_code=204)
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

from sqlalchemy.orm import Session
from models import User, Car, Achievement, UserAchievement, UserReward, QuizQuestion, QuizOption, UserQuizResult
from datetime import datetime
from models import User as UserModel
from schemas import CarCreate, UserUpdate
from passlib.context import CryptContext
from typing import List

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_user(db: Session, user_data):
    user = User(
        firstname=user_data.firstname,
        lastname=user_data.lastname,
        gender=user_data.gender,
        age=user_data.age,
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        points=0
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def get_user(db: Session, user_id: int):
    return db.query(User).filter(User.id == user_id).first()

def update_user(db: Session, db_user: User, upd: UserUpdate) -> User:
    for field, value in upd.dict(exclude_unset=True).items():
        setattr(db_user, field, value)
    db.commit()
    db.refresh(db_user)
    return db_user

def get_user_cars(db: Session, user_id: int):
    return db.query(Car).filter(Car.user_id == user_id).all()

def create_car(db: Session, car: CarCreate):
    db_car = Car(
        user_id = car.user_id,
        name    = car.name,
        brand   = car.brand,
        model   = car.model,
        color   = car.color,
        year    = car.year,
    )
    db.add(db_car)
    db.commit()
    db.refresh(db_car)
    return db_car

def grade_quiz(db: Session, user_id: int, answers: List[dict]) -> UserQuizResult:
    """
    answers: list of dicts {'question_id': .., 'selected_option_id': ..}
    """
    # load questions in batch
    q_ids = [a["question_id"] for a in answers]
    questions = db.query(QuizQuestion).filter(QuizQuestion.id.in_(q_ids)).all()
    # map question_id → correct text
    correct_map = {q.id: q.correct for q in questions}

    correct_count = 0
    for a in answers:
        # find the option text
        opt = db.query(QuizOption).get(a["selected_option_id"])
        if opt and correct_map.get(a["question_id"]) == opt.text:
            correct_count += 1

    total = len(answers)
    # e.g. 10 points per correct answer
    points_awarded = correct_count * 10

    # save result
    result = UserQuizResult(
        user_id=user_id,
        taken_at=datetime.utcnow(),
        correct_count=correct_count,
        total_questions=total,
        points_awarded=points_awarded
    )
    db.add(result)
    # also update user points
    user = db.query(User).get(user_id)
    user.points = (user.points or 0) + points_awarded
    db.commit()
    db.refresh(result)
    return result
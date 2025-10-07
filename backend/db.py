# db.py

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base


# Example: mysql+mysqlconnector://user:password@localhost:3306/safedrive
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+mysqlconnector://safedrive:StrongPassword123!@localhost:3306/safedrive"
)

# SQLAlchemy engine and session
engine = create_engine(
    DATABASE_URL,
    echo=True,       # Set to False in production
    future=True      # Enables SQLAlchemy 2.0 API
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False
)

# Base for all models
Base = declarative_base()

# Use this on FastAPI startup to ensure tables exist
def init_db():
    from models import User, Car, Achievement, UserAchievement, QuizQuestion, QuizOption, UserQuizResult
    from models import DrivingSession, PointEvent, Reward, UserReward, FeedbackReport, PhotoUpload, PasswordResetCode

    Base.metadata.create_all(bind=engine)

if __name__ == "__main__":
    init_db()
    print("Alla tabeller är skapade!")
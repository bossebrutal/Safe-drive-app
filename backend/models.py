from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Text
from sqlalchemy.orm import relationship
from db import Base

class User(Base):
    __tablename__ = "users"

    id        = Column(Integer, primary_key=True, index=True)
    firstname = Column(String(50), nullable=False)
    lastname  = Column(String(50), nullable=False)
    gender    = Column(String(10), nullable=False)
    age       = Column(Integer, nullable=False)
    email     = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(128), nullable=False)
    points    = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    avatar_url   = Column(String(255), nullable=True)
    current_car_id = Column(Integer, ForeignKey("cars.id"), nullable=True)

    current_car = relationship("Car", foreign_keys=[current_car_id], back_populates="users_who_selected_this_car")
    cars = relationship("Car", foreign_keys="Car.user_id", back_populates="creator", cascade="all, delete-orphan")
    achievements = relationship("UserAchievement", back_populates="user", cascade="all, delete-orphan")
    quiz_results = relationship("UserQuizResult", back_populates="user", cascade="all, delete-orphan")
    driving_sessions = relationship("DrivingSession", back_populates="user", cascade="all, delete-orphan")
    rewards = relationship("UserReward", back_populates="user", cascade="all, delete-orphan")
    photo_uploads = relationship("PhotoUpload", back_populates="user", cascade="all, delete-orphan")

class Car(Base):
    __tablename__ = "cars"

    id       = Column(Integer, primary_key=True, index=True)
    user_id  = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name     = Column(String(50), nullable=False)
    brand    = Column(String(50), nullable=True)
    model    = Column(String(50), nullable=True)
    color    = Column(String(50), nullable=True)
    year     = Column(Integer, nullable=True)

    creator    = relationship("User", foreign_keys=[user_id], back_populates="cars")
    users_who_selected_this_car = relationship("User", foreign_keys="User.current_car_id", back_populates="current_car")

class Achievement(Base):
    __tablename__ = "achievements"

    key         = Column(String(50), primary_key=True, index=True)
    title       = Column(String(50), nullable=False)
    description = Column(String(150))
    points      = Column(Integer, nullable=False)

    users = relationship("UserAchievement", back_populates="achievement", cascade="all, delete-orphan")

class UserAchievement(Base):
    __tablename__ = "user_achievements"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    achievement_key = Column(String(50), ForeignKey("achievements.key", ondelete="CASCADE"), nullable=False)
    unlocked_at     = Column(DateTime, default=datetime.utcnow)

    user        = relationship("User", back_populates="achievements")
    achievement = relationship("Achievement", back_populates="users")

class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    key       = Column(String(150), unique=True, nullable=False)
    question  = Column(String(150), nullable=False)
    image     = Column(String(150), nullable=True)
    correct   = Column(String(150), nullable=False)

    options   = relationship("QuizOption", back_populates="question", cascade="all, delete-orphan")

class QuizOption(Base):
    __tablename__ = "quiz_options"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    question_id = Column(Integer, ForeignKey("quiz_questions.id"), nullable=False)
    text        = Column(String(150), nullable=False)

    question    = relationship("QuizQuestion", back_populates="options")

class UserQuizResult(Base):
    __tablename__ = "user_quiz_results"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False)
    taken_at        = Column(DateTime, default=datetime.utcnow)
    correct_count   = Column(Integer, nullable=False)
    total_questions = Column(Integer, nullable=False)
    points_awarded  = Column(Integer, nullable=False)

    user = relationship("User", back_populates="quiz_results")

# ---------------- SafeDrive Additions ----------------

class DrivingSession(Base):
    __tablename__ = "driving_sessions"

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=False)
    file_path    = Column(String(255), nullable=False)
    start_time   = Column(DateTime, default=datetime.utcnow)
    end_time     = Column(DateTime, nullable=True)
    total_points = Column(Integer, default=0)

    user   = relationship("User", back_populates="driving_sessions")
    events = relationship("PointEvent", back_populates="session", cascade="all, delete-orphan")
    feedbacks = relationship("FeedbackReport", back_populates="session", cascade="all, delete-orphan")

class PointEvent(Base):
    __tablename__ = "point_events"

    id         = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("driving_sessions.id"), nullable=False)
    event_type = Column(String(100))  # e.g. 'lane_keep', 'safe_brake'
    event_score = Column(Integer)
    timestamp  = Column(DateTime, default=datetime.utcnow)

    session = relationship("DrivingSession", back_populates="events")

class Reward(Base):
    __tablename__ = "rewards"

    id          = Column(Integer, primary_key=True, index=True)
    title       = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    cost_points = Column(Integer, nullable=False)

    user_rewards = relationship("UserReward", back_populates="reward", cascade="all, delete-orphan")

class UserReward(Base):
    __tablename__ = "user_rewards"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    reward_id  = Column(Integer, ForeignKey("rewards.id"), nullable=False)
    claimed_at = Column(DateTime, default=datetime.utcnow)

    user   = relationship("User", back_populates="rewards")
    reward = relationship("Reward", back_populates="user_rewards")

class FeedbackReport(Base):
    __tablename__ = "feedback_reports"

    id         = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("driving_sessions.id"), nullable=False)
    generated_at = Column(DateTime, default=datetime.utcnow)
    summary    = Column(Text)  # Optional free-form feedback from AI system

    session = relationship("DrivingSession", back_populates="feedbacks")


class PhotoUpload(Base):
    __tablename__ = "photo_uploads"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    file_path  = Column(String(255), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relation till User
    user = relationship("User", back_populates="photo_uploads")
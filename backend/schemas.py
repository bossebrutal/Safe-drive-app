from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime

class UserCreate(BaseModel):
    firstname: str = Field(..., min_length=2)
    lastname: str = Field(..., min_length=2)
    gender: str
    age: int
    email: EmailStr
    password: str = Field(..., min_length=6)

class UserResponse(BaseModel):
    id: int
    firstname: str
    lastname: str
    email: EmailStr
    points: int
    current_car_id: Optional[int]
    avatarUrl: Optional[str] = Field(None, alias="avatar_url")

    class Config:
        from_attributes = True
        populate_by_name = True

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserUpdate(BaseModel):
    firstname:      Optional[str]    = None
    lastname:       Optional[str]    = None
    email:          Optional[EmailStr]= None
    current_car_id: Optional[int]    = None

    class Config:
        from_attributes = True

class CarBase(BaseModel):
    name: str
    brand: Optional[str]
    model: Optional[str]
    color: Optional[str]
    year: Optional[int]

class CarCreate(CarBase):
    user_id: int

class CarResponse(CarBase):
    id: int
    user_id: int
    name: str

    class Config:
        from_attributes = True

class CarUpdate(BaseModel):
    name: str
    brand: Optional[str]
    model: Optional[str]
    color: Optional[str]
    year: Optional[int]

    class Config:
        from_attributes = True

class QuizOptionOut(BaseModel):
    id: int
    text: str

    class Config:
        from_attributes = True

class QuizQuestionOut(BaseModel):
    id: int
    key: str
    question: str
    image: Optional[str]
    correct: str
    options: List[QuizOptionOut]

    class Config:
        from_attributes = True

class QuizAnswer(BaseModel):
    question_id: int
    selected_option_id: int

class QuizSubmitRequest(BaseModel):
    user_id: int
    answers: List[QuizAnswer]

class QuizSubmitResponse(BaseModel):
    total_questions: int
    correct_count: int
    points_awarded: int

    class Config:
        from_attributes = True

class RewardResponse(BaseModel):
    id: int
    title: str
    description: str | None = None
    cost_points: int
    expires_at: datetime | None = None
    location: str | None = None

    class Config:
        from_attributes = True

class UserRewardCreate(BaseModel):
    user_id: int
    reward_id: int

class UserRewardResponse(BaseModel):
    id: int
    user_id: int
    reward_id: int
    claimed_at: datetime
    expires_at: Optional[datetime] = None
    used: bool
    redeemed_at: Optional[datetime] = None
    reward: RewardResponse
    
    class Config:
        from_attributes = True

class DrivingSessionBase(BaseModel):
    user_id: int

class DrivingSessionCreate(DrivingSessionBase):
    # We won’t send `file_path` or `created_at` from the client.
    pass

class DrivingSessionResponse(BaseModel):
    id: int
    user_id: int
    file_path: str
    start_time: datetime
    end_time: Optional[datetime] = None
    total_points: int
    duration: Optional[float] = None  # Duration in seconds
    
    class Config:
        from_attributes = True

class PhotoUploadCreate(BaseModel):
    user_id: int  # Vi anger user_id som query-param, inte i kroppen

class PhotoUploadResponse(BaseModel):
    id: int
    user_id: int
    file_path: str
    created_at: datetime

    class Config:
        from_attributes = True
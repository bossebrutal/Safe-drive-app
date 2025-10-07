from datetime import datetime, timedelta
from jose import jwt, JWTError
import os

# Hämta SECRET_KEY från miljövariabel, annars använd en stark fallback
SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "k8vJ1n2Qw3e4r5t6y7u8i9o0pLkJHgFdSaQwErTyUiOpAsDfGhJkLzXcVbNmQwErTy"
)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_access_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None
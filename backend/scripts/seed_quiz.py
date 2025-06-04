# scripts/seed_quiz.py

import json
from pathlib import Path

from sqlalchemy.exc import IntegrityError
from db import SessionLocal, init_db
from models import QuizQuestion, QuizOption

def main():
    # ensure tables exist
    init_db()

    # load the JSON file
    data_path = Path(__file__).parent.parent / "backend/quiz_questions.json"
    with open(data_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    db = SessionLocal()
    added = 0

    for entry in payload:
        key      = entry["key"]
        question = entry["question"]
        correct  = entry["correct"]
        image    = entry.get("image")  # may be None
        options  = entry["options"]

        # skip if we've already got this key
        exists = db.query(QuizQuestion).filter_by(key=key).first()
        if exists:
            print(f"→ Skipping {key!r}, already in DB")
            continue

        q = QuizQuestion(
            key=key,
            question=question,
            correct=correct,
            image=image,
        )
        db.add(q)
        try:
            db.flush()  # get q.id
        except IntegrityError:
            db.rollback()
            print(f"‼️ Could not insert question {key!r}, skipping")
            continue

        # insert each option
        for opt_text in options:
            db.add(QuizOption(question_id=q.id, text=opt_text))

        try:
            db.commit()
            added += 1
            print(f"✔️ Inserted {key!r} with {len(options)} options")
        except Exception as e:
            db.rollback()
            print(f"❌ Failed to commit {key!r}: {e}")

    db.close()
    print(f"\nDone. {added} new questions added.")

if __name__ == "__main__":
    main()

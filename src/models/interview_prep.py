from enum import Enum
from pydantic import BaseModel, Field


class QuestionCategory(str, Enum):
    behavioral = "behavioral"
    technical = "technical"
    gap_probe = "gap_probe"  # likely follow-up on a skill_gap


class InterviewQuestion(BaseModel):
    question: str
    category: QuestionCategory
    relevant_resume_points: list[str] = Field(
        description="Direct quotes or paraphrases from resume that are relevant"
    )
    suggested_talking_points: list[str]


class InterviewPrepOutput(BaseModel):
    questions: list[InterviewQuestion]

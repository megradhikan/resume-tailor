from pydantic import BaseModel, Field


class ParagraphGrounding(BaseModel):
    paragraph_index: int
    grounded_in: list[str] = Field(description="Resume section refs backing this paragraph")


class CoverLetterOutput(BaseModel):
    cover_letter_draft: str
    paragraph_grounding: list[ParagraphGrounding]

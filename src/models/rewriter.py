from pydantic import BaseModel, Field


class RewriteSuggestion(BaseModel):
    section: str = Field(description="Which resume section this applies to")
    original_line: str
    suggested_line: str
    reason: str = Field(description="Why this is better for THIS job description")
    grounded_in: str = Field(
        description="Must reference a skill/tool/phrase already present in original_line. "
        "If the suggestion adds anything not in the original, it must be rejected."
    )


class RewriteOutput(BaseModel):
    suggestions: list[RewriteSuggestion]

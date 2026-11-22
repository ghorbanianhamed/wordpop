from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Category, User, word_categories
from ..schemas import CategoryIn, CategoryOut, CategoryUpdate
from ..security import get_current_user

router = APIRouter(prefix="/api/categories", tags=["categories"])


def _get(db: Session, user: User, category_id: int) -> Category:
    cat = db.get(Category, category_id)
    if not cat or cat.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    return cat


def _out(cat: Category, count: int) -> CategoryOut:
    out = CategoryOut.model_validate(cat)
    out.word_count = count
    return out


@router.get("", response_model=list[CategoryOut])
def list_categories(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    counts = dict(
        db.execute(
            select(word_categories.c.category_id, func.count())
            .join(Category, Category.id == word_categories.c.category_id)
            .where(Category.user_id == user.id)
            .group_by(word_categories.c.category_id)
        ).all()
    )
    cats = db.scalars(
        select(Category).where(Category.user_id == user.id).order_by(Category.name)
    )
    return [_out(c, counts.get(c.id, 0)) for c in cats]


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    data: CategoryIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    name = data.name.strip()
    if db.scalar(
        select(Category).where(Category.user_id == user.id, func.lower(Category.name) == name.lower())
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "You already have a category with this name")
    cat = Category(user_id=user.id, name=name, color=data.color, notify=data.notify)
    db.add(cat)
    db.commit()
    return _out(cat, 0)


@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    data: CategoryUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cat = _get(db, user, category_id)
    changes = data.model_dump(exclude_none=True)
    if "name" in changes:
        name = changes["name"].strip()
        if not name:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Give the category a name")
        taken = db.scalar(
            select(Category).where(
                Category.user_id == user.id, func.lower(Category.name) == name.lower(), Category.id != cat.id
            )
        )
        if taken:
            raise HTTPException(status.HTTP_409_CONFLICT, "You already have a category with this name")
        changes["name"] = name
    for field, value in changes.items():
        setattr(cat, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    return _out(cat, len(cat.words))


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Deletes the category only - its words stay in the user's list."""
    db.delete(_get(db, user, category_id))
    db.commit()

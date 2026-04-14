"use client";

import { useEffect, useMemo, useState } from "react";

type QuestionItem = {
  id: number;
  order_index: number;
  is_required: boolean;
  text_ko: string;
  text_en: string;
};

type QuestionListProps = {
  questionSetId: number;
  initialQuestions: QuestionItem[];
  deleteQuestionAction: (formData: FormData) => Promise<void>;
};

function sortedQuestions(questions: QuestionItem[]): QuestionItem[] {
  return [...questions]
    .sort((a, b) => {
      if (a.order_index !== b.order_index) {
        return a.order_index - b.order_index;
      }
      return a.id - b.id;
    })
    .map((question, index) => ({
      ...question,
      order_index: index + 1
    }));
}

function reorderList(questions: QuestionItem[], draggedId: number, targetId: number): QuestionItem[] {
  const fromIndex = questions.findIndex((question) => question.id === draggedId);
  const toIndex = questions.findIndex((question) => question.id === targetId);

  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return questions;
  }

  const next = [...questions];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);

  return next.map((question, index) => ({
    ...question,
    order_index: index + 1
  }));
}

async function saveReorder(questionSetId: number, orderedQuestionIds: number[]): Promise<string | null> {
  const response = await fetch("/api/internal/questions/reorder", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      questionSetId,
      orderedQuestionIds
    })
  });

  if (response.ok) {
    return null;
  }

  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error || "질문 순서 저장에 실패했습니다.";
  } catch {
    return "질문 순서 저장에 실패했습니다.";
  }
}

export default function QuestionList({
  questionSetId,
  initialQuestions,
  deleteQuestionAction
}: QuestionListProps) {
  const initialSortedQuestions = useMemo(() => sortedQuestions(initialQuestions), [initialQuestions]);
  const [questions, setQuestions] = useState<QuestionItem[]>(initialSortedQuestions);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [isErrorMessage, setIsErrorMessage] = useState<boolean>(false);

  useEffect(() => {
    setQuestions(initialSortedQuestions);
  }, [initialSortedQuestions]);

  async function handleReorder(draggedId: number, targetId: number): Promise<void> {
    const previous = questions;
    const next = reorderList(previous, draggedId, targetId);

    if (next === previous) {
      return;
    }

    setQuestions(next);
    setSaveMessage("순서를 저장하는 중...");
    setIsErrorMessage(false);

    const error = await saveReorder(
      questionSetId,
      next.map((question) => question.id)
    );

    if (error) {
      setQuestions(previous);
      setSaveMessage(error);
      setIsErrorMessage(true);
      return;
    }

    setSaveMessage("질문 순서를 저장했습니다.");
    setIsErrorMessage(false);
  }

  if (questions.length === 0) {
    return <p className="empty">등록된 질문이 없습니다.</p>;
  }

  return (
    <>
      <ul className="question-list">
        {questions.map((question) => {
          const isDragging = draggingId === question.id;
          const isDragOver = dragOverId === question.id && draggingId !== question.id;
          return (
            <li
              key={question.id}
              className={`question-item ${isDragging ? "dragging" : ""} ${isDragOver ? "drag-over" : ""}`.trim()}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(question.id));
                setDraggingId(question.id);
                setDragOverId(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (draggingId !== question.id) {
                  setDragOverId(question.id);
                }
              }}
              onDrop={async (event) => {
                event.preventDefault();
                const draggedFromState = draggingId;
                const draggedFromData = Number(event.dataTransfer.getData("text/plain"));
                const draggedId =
                  typeof draggedFromState === "number" && Number.isFinite(draggedFromState)
                    ? draggedFromState
                    : draggedFromData;
                if (!Number.isFinite(draggedId) || draggedId <= 0) {
                  setDraggingId(null);
                  setDragOverId(null);
                  return;
                }

                setDraggingId(null);
                setDragOverId(null);
                await handleReorder(draggedId, question.id);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setDragOverId(null);
              }}
            >
              <div className="question-info">
                <div>
                  <strong>#{question.order_index}</strong> {question.text_ko || question.text_en || "(내용 없음)"}
                </div>
                <div className="question-meta">
                  {question.is_required ? (
                    <span className="badge badge-outline-danger">필수</span>
                  ) : (
                    <span className="badge badge-outline-info">선택</span>
                  )}
                </div>
              </div>

              <div className="d-flex align-center gap-2">
                <span className="drag-handle" aria-hidden>
                  ↕
                </span>
                <form
                  action={deleteQuestionAction}
                  onClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => event.preventDefault()}
                >
                  <input type="hidden" name="questionId" value={String(question.id)} />
                  <button className="btn btn-outline-danger btn-xs" type="submit" draggable={false}>
                    삭제
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>

      {saveMessage ? (
        <p className="text-small mt-2" style={{ color: isErrorMessage ? "#fe7c96" : "var(--text-muted)" }}>
          {saveMessage}
        </p>
      ) : null}
    </>
  );
}

import React, { useMemo, useState } from 'react';
import type { MatchCardContent, TrainingQuestion } from '../../types/trainingGrounds';
import { matchPairsOf, shuffledResponseIds } from '../../utils/quizMatching';

interface MatchingQuestionBoardProps {
  question: TrainingQuestion;
  /** prompt pair id → response pair id */
  selections: Record<string, string>;
  onChange?: (next: Record<string, string>) => void;
  disabled?: boolean;
  /** Show which matches are right and the correct answer for wrong / empty slots. */
  reveal?: boolean;
  /** Shuffle seed for response cards; defaults to the question id. */
  seed?: string;
  className?: string;
}

const DRAG_MIME = 'text/x-mst-match-response';

const CardContent: React.FC<{ card: MatchCardContent; placeholder?: string }> = ({ card, placeholder }) => {
  const text = card.text?.trim();
  return (
    <>
      {card.imageUrl ? <img className="mst-match-card-img" src={card.imageUrl} alt={text || 'Match card'} draggable={false} /> : null}
      {text ? <span className="mst-match-card-text">{text}</span> : null}
      {!text && !card.imageUrl && placeholder ? <span className="mst-match-card-text">{placeholder}</span> : null}
    </>
  );
};

/**
 * Drag each response onto its prompt (mouse), or tap a response then tap a slot (touch / keyboard).
 * Each response can be used once; dropping onto a filled slot sends the old card back to the bank.
 */
const MatchingQuestionBoard: React.FC<MatchingQuestionBoardProps> = ({
  question,
  selections,
  onChange,
  disabled = false,
  reveal = false,
  seed,
  className,
}) => {
  const pairs = useMemo(() => matchPairsOf(question), [question]);
  const pairById = useMemo(() => new Map(pairs.map((p) => [p.id, p])), [pairs]);
  const responseOrder = useMemo(() => shuffledResponseIds(pairs, seed || question.id), [pairs, seed, question.id]);
  const [heldResponseId, setHeldResponseId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);

  const locked = disabled || reveal || !onChange;
  const placedResponseIds = new Set(Object.values(selections));
  const bank = responseOrder.filter((id) => !placedResponseIds.has(id));

  const place = (promptId: string, responseId: string) => {
    if (locked || !pairById.has(responseId)) return;
    const next: Record<string, string> = {};
    for (const [pid, rid] of Object.entries(selections)) {
      if (rid !== responseId && pid !== promptId) next[pid] = rid;
    }
    next[promptId] = responseId;
    onChange!(next);
    setHeldResponseId(null);
  };

  const unplace = (promptId: string) => {
    if (locked) return;
    const next = { ...selections };
    delete next[promptId];
    onChange!(next);
  };

  const handleSlotClick = (promptId: string) => {
    if (locked) return;
    if (heldResponseId) {
      place(promptId, heldResponseId);
      return;
    }
    const placed = selections[promptId];
    if (placed) setHeldResponseId(placed);
  };

  const responseCard = (responseId: string, where: 'bank' | 'slot') => {
    const pair = pairById.get(responseId);
    if (!pair) return null;
    const held = heldResponseId === responseId;
    return (
      <div
        key={`${where}-${responseId}`}
        role="button"
        tabIndex={locked ? -1 : 0}
        aria-pressed={held}
        aria-label={`Answer card: ${pair.response.text?.trim() || 'image'}`}
        className={`mst-match-response${held ? ' is-held' : ''}`}
        draggable={!locked}
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_MIME, responseId);
          e.dataTransfer.setData('text/plain', responseId);
          e.dataTransfer.effectAllowed = 'move';
          setHeldResponseId(responseId);
        }}
        onDragEnd={() => {
          setHeldResponseId(null);
          setDragOverSlot(null);
        }}
        onClick={(e) => {
          if (locked) return;
          if (where === 'slot') return;
          e.stopPropagation();
          setHeldResponseId(held ? null : responseId);
        }}
        onKeyDown={(e) => {
          if (locked || where === 'slot') return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setHeldResponseId(held ? null : responseId);
          }
        }}
      >
        <CardContent card={pair.response} />
      </div>
    );
  };

  return (
    <div className={`mst-match${locked ? ' is-locked' : ''}${className ? ` ${className}` : ''}`}>
      {!locked && (
        <p className="mst-match-hint">
          Drag each card from the bottom onto its match, or tap a card and then tap where it goes. Each match is worth
          1 point.
        </p>
      )}

      <div className="mst-match-grid">
        {pairs.map((pair, index) => {
          const placedId = selections[pair.id];
          const isRight = placedId === pair.id;
          const slotState = reveal ? (placedId ? (isRight ? 'is-correct' : 'is-wrong') : 'is-empty-wrong') : '';
          return (
            <div key={pair.id} className={`mst-match-column mst-match-color-${index % 6}`}>
              <div className="mst-match-prompt">
                <CardContent card={pair.prompt} />
              </div>
              <div
                role="button"
                tabIndex={locked ? -1 : 0}
                aria-label={`Drop zone for ${pair.prompt.text?.trim() || `prompt ${index + 1}`}`}
                className={`mst-match-slot ${slotState}${dragOverSlot === pair.id ? ' is-drag-over' : ''}${
                  heldResponseId && !locked ? ' is-target' : ''
                }`.trim()}
                onClick={() => handleSlotClick(pair.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSlotClick(pair.id);
                  }
                }}
                onDragOver={(e) => {
                  if (locked) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverSlot !== pair.id) setDragOverSlot(pair.id);
                }}
                onDragLeave={() => setDragOverSlot((cur) => (cur === pair.id ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverSlot(null);
                  const id = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain');
                  if (id) place(pair.id, id);
                }}
              >
                {placedId ? (
                  <>
                    {responseCard(placedId, 'slot')}
                    {!locked && (
                      <button
                        type="button"
                        className="mst-match-remove"
                        aria-label="Send card back"
                        onClick={(e) => {
                          e.stopPropagation();
                          unplace(pair.id);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </>
                ) : (
                  <span className="mst-match-slot-placeholder">{reveal ? 'No match' : 'Drop match here'}</span>
                )}
                {reveal && !isRight && (
                  <div className="mst-match-answer">
                    Answer: <CardContent card={pair.response} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!locked && (
        <div
          className={`mst-match-bank${bank.length === 0 ? ' is-empty' : ''}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain');
            const promptId = Object.keys(selections).find((pid) => selections[pid] === id);
            if (promptId) unplace(promptId);
          }}
        >
          {bank.length > 0 ? (
            bank.map((id) => responseCard(id, 'bank'))
          ) : (
            <span className="mst-match-bank-done">All cards placed. Tap a placed card to move it.</span>
          )}
        </div>
      )}
    </div>
  );
};

export default MatchingQuestionBoard;

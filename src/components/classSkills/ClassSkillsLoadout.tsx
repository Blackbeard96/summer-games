import React, { useEffect, useMemo, useState } from 'react';
import type { ClassSkill } from '../../types/classSkills';
import { CLASS_SKILL_ELEMENTS } from '../../types/classSkills';
import {
  CLASS_SKILL_LIMITS,
  classSkillUnlockState,
  effectiveClassSkillLoadout,
  elementalLevelFromMoves,
  parseClassSkillEquipped,
} from '../../utils/classSkillsConfig';
import { subscribeClassSkillLoadout, subscribeClassSkills } from '../../utils/classSkillsService';
import { setClassSkillEquipped, subscribeClassSkillCapacity, subscribeClassSkillEquipped } from '../../utils/classSkillPhaseService';
import { useAuth } from '../../context/AuthContext';
import ClassSkillCard from './ClassSkillCard';
import '../classFlow/classFlow.css';
import './classSkills.css';

interface ClassSkillsLoadoutProps {
  /** The player's battle moves; elemental level = highest unlocked elemental move (existing progression). */
  moves: unknown[];
}

/**
 * Class Skills (IRL) loadout: equip unlocked Class Skills into their own slots (default 3), separate from
 * the 6 In-Game Skill slots. Equipped skills are the ones players can use after a Battle Sprint ends.
 */
const ClassSkillsLoadout: React.FC<ClassSkillsLoadoutProps> = ({ moves }) => {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const [skills, setSkills] = useState<ClassSkill[]>([]);
  const [picks, setPicks] = useState<string[]>([]);
  const [rawEquipped, setRawEquipped] = useState<string[]>([]);
  const [capacity, setCapacity] = useState<number>(CLASS_SKILL_LIMITS.defaultCapacity);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => subscribeClassSkills(setSkills), []);
  useEffect(() => subscribeClassSkillCapacity(setCapacity), []);
  useEffect(() => (uid ? subscribeClassSkillLoadout(uid, setPicks) : undefined), [uid]);
  useEffect(() => (uid ? subscribeClassSkillEquipped(uid, setRawEquipped) : undefined), [uid]);

  const levels = useMemo(() => {
    const out: Record<string, number> = {};
    CLASS_SKILL_ELEMENTS.forEach((el) => (out[el] = elementalLevelFromMoves(moves, el)));
    return out;
  }, [moves]);
  const chosen = effectiveClassSkillLoadout(picks, skills);
  const myElements = CLASS_SKILL_ELEMENTS.filter((el) => (levels[el] || 0) > 0);
  const relevant = skills.filter((s) => s.status === 'active' && myElements.includes(s.element));
  const byId = Object.fromEntries(skills.map((s) => [s.id, s]));
  const equipped = parseClassSkillEquipped(rawEquipped, capacity).filter((id) => byId[id]);
  const unlocked = relevant.filter((s) => classSkillUnlockState(s, levels, chosen).unlocked);
  const available = unlocked.filter((s) => !equipped.includes(s.id));
  const locked = relevant.filter((s) => !classSkillUnlockState(s, levels, chosen).unlocked);
  const full = equipped.length >= capacity;
  const cost = CLASS_SKILL_LIMITS.defaultClassSkillCost;

  const save = async (next: string[], text: string) => {
    if (!uid) return;
    setBusy(true);
    const res = await setClassSkillEquipped(uid, next, capacity);
    setBusy(false);
    setMsg(res.ok ? { ok: true, text } : { ok: false, text: res.error });
  };

  return (
    <div className="cf-root cs-root" style={{ marginBottom: '2rem' }} data-testid="class-skills-loadout">
      <div className="cf-between">
        <div>
          <h4 className="cf-title">Class Skills (IRL)</h4>
          <div className="cf-sub">
            Classroom skills you use after a Battle Sprint ends, paid with Live Event Participation Points (not Vault PP). They
            have their own slots and never take one of your In-Game Skill slots.
          </div>
        </div>
        <span className="cf-badge" data-testid="class-skill-capacity">
          Equipped {equipped.length}/{capacity}
        </span>
      </div>
      {msg && (
        <div className={`cf-msg${msg.ok ? '' : ' cf-msg--error'}`} role="status" style={{ marginTop: 8 }}>
          {msg.text}
        </div>
      )}

      {myElements.length === 0 ? (
        <div className="cf-empty" style={{ marginTop: 10 }}>
          Unlock an elemental move to start unlocking Class Skills.
        </div>
      ) : (
        <>
          <div className="cf-stat-label" style={{ margin: '12px 0 6px' }}>
            Equipped
          </div>
          {equipped.length === 0 ? (
            <div className="cf-empty">No Class Skills equipped yet. Equip up to {capacity} below.</div>
          ) : (
            <div className="cs-skill-grid">
              {equipped.map((id) => {
                const s = byId[id];
                const unlock = classSkillUnlockState(s, levels, chosen);
                return (
                  <ClassSkillCard key={id} skill={s} cost={cost} equipped status={unlock.unlocked ? null : { label: unlock.reason, tone: 'locked' }}>
                    <button type="button" className="cf-btn cf-btn--ghost" disabled={busy} onClick={() => save(equipped.filter((x) => x !== id), `${s.name} unequipped.`)}>
                      Unequip
                    </button>
                  </ClassSkillCard>
                );
              })}
            </div>
          )}

          <div className="cf-stat-label" style={{ margin: '14px 0 6px' }}>
            Unlocked
          </div>
          {available.length === 0 ? (
            <div className="cf-empty">{unlocked.length ? 'Every unlocked Class Skill is equipped.' : 'No Class Skills unlocked yet.'}</div>
          ) : (
            <div className="cs-skill-grid">
              {available.map((s) => (
                <ClassSkillCard key={s.id} skill={s} cost={cost} status={{ label: 'Unlocked', tone: 'ready' }}>
                  <button
                    type="button"
                    className="cf-btn cf-btn--primary"
                    disabled={busy || full}
                    title={full ? `All ${capacity} Class Skill slots are full. Unequip one first.` : undefined}
                    onClick={() => save([...equipped, s.id], `${s.name} equipped.`)}
                  >
                    {full ? 'Slots full' : 'Equip'}
                  </button>
                </ClassSkillCard>
              ))}
            </div>
          )}

          {locked.length > 0 && (
            <>
              <div className="cf-stat-label" style={{ margin: '14px 0 6px' }}>
                Locked
              </div>
              <div className="cs-skill-grid">
                {locked.map((s) => {
                  const u = classSkillUnlockState(s, levels, chosen);
                  return <ClassSkillCard key={s.id} skill={s} cost={cost} compact status={{ label: u.unlocked ? 'Unlocked' : u.reason, tone: 'locked' }} />;
                })}
              </div>
            </>
          )}
          <div className="cf-sub" style={{ marginTop: 10 }}>
            Default cost is {cost} Participation Points per use; a facilitator may set a different cost for their Live Event.
          </div>
        </>
      )}
    </div>
  );
};

export default ClassSkillsLoadout;

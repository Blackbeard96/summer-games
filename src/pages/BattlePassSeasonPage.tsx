import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import BattlePass from '../components/BattlePass';
import BattlePassIntroExperienceModal from '../components/BattlePassIntroExperienceModal';
import DeployedBattlePassTierTrack from '../components/DeployedBattlePassTierTrack';
import { fetchActiveBattlePassSeason } from '../utils/activeBattlePassClient';
import { computeHomeBattlePassDisplay } from '../utils/homeBattlePassDisplay';
import { mergeSeason1FromStudentData } from '../utils/season1PlayerHydration';
import { markBattlePassIntroSeenForSeason } from '../utils/awardBattlePassXp';
import {
  isBattlePassIntroDismissedLocally,
  markBattlePassIntroDismissedLocally,
} from '../utils/battlePassIntroClient';
import type { Season } from '../types/season1';

/**
 * `/battle-pass` — shows the admin-deployed active pass from `seasons/{id}` when set on
 * `adminSettings/season1.activeBattlePassSeasonId`. Legacy Season 0 modal remains available.
 */
const BattlePassSeasonPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [showLegacy, setShowLegacy] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [season, setSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState(0);
  const [maxTier, setMaxTier] = useState(0);
  const [bpXp, setBpXp] = useState(0);
  const [introSeenForSeason, setIntroSeenForSeason] = useState(true);
  const [claimedRewardIds, setClaimedRewardIds] = useState<string[]>([]);
  const introAutoOpenedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const active = await fetchActiveBattlePassSeason();
      setSeason(active);
      if (!currentUser || !active) {
        setTier(0);
        setMaxTier(0);
        setBpXp(0);
        setClaimedRewardIds([]);
        setIntroSeenForSeason(true);
        return;
      }
      const snap = await getDoc(doc(db, 'students', currentUser.uid));
      const data = snap.exists() ? snap.data() : undefined;
      const disp = computeHomeBattlePassDisplay(
        data as Record<string, unknown> | undefined,
        active,
        15,
        () => 0
      );
      setTier(disp.battlePassTier);
      setMaxTier(disp.maxTier);
      setBpXp(disp.battlePassXP);
      const s1 = mergeSeason1FromStudentData(data?.season1 as Record<string, unknown> | undefined);
      setClaimedRewardIds(
        Array.isArray(s1.battlePass.claimedRewardIds)
          ? s1.battlePass.claimedRewardIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
          : []
      );
      const sid = active.id?.trim();
      setIntroSeenForSeason(
        !!(sid && (s1.battlePass.introSeenSeasonId === sid || isBattlePassIntroDismissedLocally(currentUser.uid, sid)))
      );
    } catch (e) {
      console.error('BattlePassSeasonPage load failed', e);
      setSeason(null);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    introAutoOpenedRef.current = false;
  }, [season?.id]);

  useEffect(() => {
    if (loading || !season || !currentUser) return;
    if (introSeenForSeason) return;
    const hasIntro = !!(
      season.seasonIntroVideoUrl?.trim() ||
      (season.introSequence && season.introSequence.length > 0)
    );
    if (!hasIntro || introAutoOpenedRef.current) return;
    introAutoOpenedRef.current = true;
    setIntroOpen(true);
  }, [loading, season, currentUser, introSeenForSeason]);

  const closeSeasonIntro = async () => {
    setIntroOpen(false);
    if (currentUser?.uid && season?.id) {
      markBattlePassIntroDismissedLocally(currentUser.uid, season.id);
      setIntroSeenForSeason(true);
      await markBattlePassIntroSeenForSeason(currentUser.uid, season.id);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
        color: '#fff',
        padding: '1.5rem',
      }}
    >
      <button
        type="button"
        onClick={() => navigate('/home')}
        style={{
          marginBottom: '1rem',
          background: 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.2)',
          color: '#fff',
          padding: '0.5rem 1rem',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        ← Home
      </button>

      {loading && !season ? (
        <p style={{ opacity: 0.85 }}>Loading battle pass…</p>
      ) : season ? (
        <>
          <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem' }}>{season.name}</h1>
          {season.theme ? (
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#a5b4fc' }}>{season.theme}</p>
          ) : null}
          <p style={{ opacity: 0.88, maxWidth: 640, lineHeight: 1.55, marginBottom: '1.25rem' }}>
            {season.description || 'Progress through tiers and earn rewards. This track is live for all players.'}
          </p>
          {(season.seasonIntroVideoUrl?.trim() || (season.introSequence && season.introSequence.length > 0)) ? (
            <div style={{ marginBottom: '1.25rem' }}>
              <button
                type="button"
                onClick={() => setIntroOpen(true)}
                style={{
                  background: 'linear-gradient(180deg, #6366f1 0%, #4f46e5 100%)',
                  border: '1px solid rgba(165,180,252,0.5)',
                  color: '#fff',
                  padding: '0.65rem 1.25rem',
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                }}
              >
                Season intro
              </button>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', opacity: 0.75, maxWidth: 420 }}>
                Step through the intro your coaches configured (slides and videos in order).
              </p>
            </div>
          ) : null}
          <div
            style={{
              marginBottom: '1.25rem',
              padding: '1rem 1.25rem',
              borderRadius: 12,
              background: 'rgba(15,23,42,0.75)',
              border: '1px solid rgba(129,140,248,0.45)',
              maxWidth: 480,
            }}
          >
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a5b4fc' }}>
              Your progress
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: 6 }}>
              Tier {tier} / {maxTier}
            </div>
            <div style={{ fontSize: '0.95rem', opacity: 0.9, marginTop: 4 }}>{bpXp.toLocaleString()} battle pass XP</div>
            <p style={{ fontSize: '0.8rem', opacity: 0.75, marginTop: 10, marginBottom: 0, lineHeight: 1.45 }}>
              Tiers unlock from battle pass XP on your account for this season only (not from general profile XP).
            </p>
          </div>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Tiers &amp; rewards</h2>
          <p style={{ fontSize: '0.82rem', opacity: 0.78, maxWidth: 720, marginBottom: '1rem', lineHeight: 1.45 }}>
            Same card style as Season 0 — icons, rarity, and names from your admin config. Claim each reward once you have
            unlocked its tier. Choice groups let you pick one option per tier group.
          </p>
          <DeployedBattlePassTierTrack
            tiers={season.tiers}
            playerTier={tier}
            seasonId={season.id}
            userId={currentUser?.uid}
            claimedRewardIds={claimedRewardIds}
            onRewardClaimed={() => void load()}
          />
          <BattlePassIntroExperienceModal
            open={introOpen}
            onClose={() => void closeSeasonIntro()}
            seasonTitle={season.name}
            heroVideoUrl={season.seasonIntroVideoUrl}
            introSteps={season.introSequence ?? []}
          />
        </>
      ) : (
        <>
          <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem' }}>Battle Pass — Flow State</h1>
          <p style={{ opacity: 0.85, maxWidth: 560, lineHeight: 1.5 }}>
            No battle pass is deployed yet. When an admin sets one active, it will appear here and on Home automatically.
          </p>
          <div
            style={{
              marginTop: '1.5rem',
              padding: '2rem 1.5rem',
              borderRadius: 12,
              background: 'rgba(15,23,42,0.75)',
              border: '1px solid rgba(129,140,248,0.45)',
              maxWidth: 480,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '0.8rem',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#a5b4fc',
                fontWeight: 700,
                marginBottom: '0.75rem',
              }}
            >
              Season 1
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, lineHeight: 1.3, marginBottom: '0.75rem' }}>
              No active season in Firestore yet
            </div>
            <p style={{ margin: 0, fontSize: '0.95rem', opacity: 0.88, lineHeight: 1.55 }}>
              Season 1 Flow &amp; Energy is live in the app. Deploy a pass in Sage&apos;s Chamber to show tier tracks here.
              Legacy Season 0 rewards and claims stay available below.
            </p>
          </div>
        </>
      )}

      <div style={{ marginTop: '2rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        <button
          type="button"
          onClick={() => setShowLegacy(true)}
          style={{
            background: 'rgba(251,191,36,0.15)',
            border: '1px solid rgba(251,191,36,0.5)',
            color: '#fde68a',
            padding: '0.75rem 1.25rem',
            borderRadius: 8,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Open Season 0 Battle Pass (rewards &amp; claims)
        </button>
        {season ? (
          <button
            type="button"
            onClick={() => load()}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#e2e8f0',
              padding: '0.75rem 1.25rem',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        ) : null}
      </div>
      <BattlePass isOpen={showLegacy} onClose={() => setShowLegacy(false)} season={0} />
    </div>
  );
};

export default BattlePassSeasonPage;

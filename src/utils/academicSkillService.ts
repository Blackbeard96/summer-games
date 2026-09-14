import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { AcademicSkill } from '../types/academicSkills';
import { slugifySkillName } from './masteryCalculations';

const COLLECTION = 'academicSkills';

export async function listAcademicSkills(options?: {
  activeOnly?: boolean;
  category?: string;
}): Promise<AcademicSkill[]> {
  const snapshot = await getDocs(collection(db, COLLECTION));
  let skills = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as AcademicSkill));
  if (options?.activeOnly) {
    skills = skills.filter((s) => s.active !== false);
  }
  if (options?.category) {
    skills = skills.filter((s) => s.category === options.category);
  }
  skills.sort((a, b) => {
    const cat = (a.category || '').localeCompare(b.category || '');
    if (cat !== 0) return cat;
    return a.name.localeCompare(b.name);
  });
  return skills;
}

export async function getAcademicSkill(skillId: string): Promise<AcademicSkill | null> {
  const snap = await getDoc(doc(db, COLLECTION, skillId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as AcademicSkill;
}

export async function createAcademicSkill(
  input: Omit<AcademicSkill, 'id' | 'createdAt' | 'updatedAt' | 'slug'> & { slug?: string },
  createdBy: string
): Promise<string> {
  const slug = input.slug || slugifySkillName(input.name);
  const ref = await addDoc(collection(db, COLLECTION), {
    name: input.name.trim(),
    slug,
    description: input.description || '',
    category: input.category || '',
    courseId: input.courseId || null,
    parentSkillId: input.parentSkillId || null,
    icon: input.icon || '✦',
    color: input.color || '#d4a84f',
    active: input.active !== false,
    linkedSkillTreeNodeId: input.linkedSkillTreeNodeId || null,
    linkedRewardId: input.linkedRewardId || null,
    linkedManifestId: input.linkedManifestId || null,
    linkedAbilityId: input.linkedAbilityId || null,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateAcademicSkill(
  skillId: string,
  updates: Partial<AcademicSkill>
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  const allowed: (keyof AcademicSkill)[] = [
    'name',
    'slug',
    'description',
    'category',
    'courseId',
    'parentSkillId',
    'icon',
    'color',
    'active',
    'linkedSkillTreeNodeId',
    'linkedRewardId',
    'linkedManifestId',
    'linkedAbilityId',
  ];
  for (const key of allowed) {
    if (updates[key] !== undefined) payload[key] = updates[key];
  }
  if (typeof payload.name === 'string' && !updates.slug) {
    payload.slug = slugifySkillName(payload.name);
  }
  await updateDoc(doc(db, COLLECTION, skillId), payload as any);
}

export async function archiveAcademicSkill(skillId: string): Promise<void> {
  await updateAcademicSkill(skillId, { active: false });
}

/** Optional starter catalog for Design Principles + Illustrator */
export async function seedDefaultAcademicSkills(createdBy: string): Promise<number> {
  const existing = await listAcademicSkills();
  if (existing.length > 0) return 0;

  const parents: { name: string; category: string; children: string[] }[] = [
    {
      name: 'Design Principles',
      category: 'Design',
      children: [
        'Contrast',
        'Alignment',
        'Repetition',
        'Proximity',
        'Hierarchy',
        'Balance',
        'White Space',
      ],
    },
    {
      name: 'Adobe Illustrator',
      category: 'Illustrator',
      children: [
        'Layers',
        'Pen Tool',
        'Shape Builder',
        'Pathfinder',
        'Asset Import',
        'File Management',
      ],
    },
  ];

  let created = 0;
  for (const group of parents) {
    const parentId = await createAcademicSkill(
      {
        name: group.name,
        category: group.category,
        description: `${group.name} skill family`,
        active: true,
        icon: '◈',
      },
      createdBy
    );
    created += 1;
    for (const child of group.children) {
      await createAcademicSkill(
        {
          name: child,
          category: group.category,
          parentSkillId: parentId,
          description: `${child} under ${group.name}`,
          active: true,
          icon: '✦',
        },
        createdBy
      );
      created += 1;
    }
  }
  return created;
}

export function groupSkillsByCategory(skills: AcademicSkill[]): Record<string, AcademicSkill[]> {
  const map: Record<string, AcademicSkill[]> = {};
  for (const s of skills) {
    const key = s.category || 'Uncategorized';
    if (!map[key]) map[key] = [];
    map[key].push(s);
  }
  return map;
}

export async function ensureSkillDocId(skillId: string, data: Partial<AcademicSkill>): Promise<void> {
  await setDoc(doc(db, COLLECTION, skillId), data, { merge: true });
}

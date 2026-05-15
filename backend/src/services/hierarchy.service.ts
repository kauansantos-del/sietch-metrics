// Hierarquia transitiva de gestor — task-progressao-colaborador.md §10
// Se Pedro reporta a Maria e Maria reporta a João, João vê Pedro.

import { prisma } from '../config/prisma';

const MAX_DEPTH = 8; // safety guard contra ciclos

/**
 * BFS por descendentes diretos e indiretos de um gestor.
 * Retorna conjunto de userIds que o gestor pode ver.
 */
export async function getTeamMemberIds(managerId: string): Promise<Set<string>> {
  const result = new Set<string>();
  let current = [managerId];

  for (let depth = 0; depth < MAX_DEPTH && current.length > 0; depth++) {
    const reports = await prisma.user.findMany({
      where: { managerId: { in: current }, active: true },
      select: { id: true },
    });
    const ids = reports.map((r) => r.id).filter((id) => !result.has(id));
    if (ids.length === 0) break;
    ids.forEach((id) => result.add(id));
    current = ids;
  }

  return result;
}

/**
 * Retorna true se viewer pode ver dados de target.
 * - SUPER_ADMIN/ADMIN: vê todos
 * - Próprio user: vê si
 * - Gestor: vê membros do time (direto + indireto)
 */
export async function canViewUser(
  viewerId: string,
  viewerRole: string,
  targetUserId: string,
): Promise<boolean> {
  if (viewerRole === 'SUPER_ADMIN' || viewerRole === 'ADMIN') return true;
  if (viewerId === targetUserId) return true;

  const team = await getTeamMemberIds(viewerId);
  return team.has(targetUserId);
}

/**
 * Lista usuários que o viewer pode ver (para filtros, dropdowns).
 */
export async function listVisibleUsers(viewerId: string, viewerRole: string) {
  if (viewerRole === 'SUPER_ADMIN' || viewerRole === 'ADMIN') {
    return prisma.user.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, email: true, role: true, team: true, managerId: true,
      },
    });
  }

  const team = await getTeamMemberIds(viewerId);
  team.add(viewerId);

  return prisma.user.findMany({
    where: { id: { in: Array.from(team) }, active: true },
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, email: true, role: true, team: true, managerId: true,
    },
  });
}

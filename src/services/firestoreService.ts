import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { api } from '../lib/api';
import { firestoreDb } from '../lib/firebase';
import type {
  AuditLog,
  DashboardStats,
  Handover,
  Project,
  ReportItem,
  SourceDocument,
  UserProfile,
  UserRole,
} from '../types';

/**
 * HandoverIQ Firestore Database Service
 * Provides typed access to all required collections:
 * users, projects, projectMembers, handoverSessions, uploadedSources,
 * extractedInsights, handoverReports, approvals, and auditLogs.
 */
export const firestoreService = {
  collections: {
    users: () => collection(firestoreDb, 'users'),
    projects: () => collection(firestoreDb, 'projects'),
    projectMembers: () => collection(firestoreDb, 'projectMembers'),
    handoverSessions: () => collection(firestoreDb, 'handoverSessions'),
    uploadedSources: () => collection(firestoreDb, 'uploadedSources'),
    extractedInsights: () => collection(firestoreDb, 'extractedInsights'),
    handoverReports: () => collection(firestoreDb, 'handoverReports'),
    approvals: () => collection(firestoreDb, 'approvals'),
    auditLogs: () => collection(firestoreDb, 'auditLogs'),
  },

  // Dashboard
  async getDashboardStats(): Promise<DashboardStats> {
    const { stats } = await api.dashboard.getStats();
    return stats;
  },

  // Users
  async listUsers(): Promise<UserProfile[]> {
    const { users } = await api.users.list();
    return users;
  },

  async updateUserRole(
    uid: string,
    payload: { role: UserRole; department?: string; title?: string }
  ): Promise<UserProfile> {
    const { user } = await api.users.updateRole(uid, payload);
    await setDoc(doc(firestoreDb, 'users', uid), user, { merge: true }).catch(() => null);
    return user;
  },

  // Projects & ProjectMembers
  async listProjects(): Promise<Project[]> {
    const { projects } = await api.projects.list();
    return projects;
  },

  async getProjectDetails(id: string): Promise<{
    project: Project;
    handovers: Handover[];
    activityLogs: AuditLog[];
  }> {
    return api.projects.get(id);
  },

  async createProject(payload: Partial<Project>): Promise<Project> {
    const { project } = await api.projects.create(payload);
    await setDoc(doc(firestoreDb, 'projects', project.id), project).catch(() => null);
    return project;
  },

  async updateProject(id: string, payload: Partial<Project>): Promise<Project> {
    const { project } = await api.projects.update(id, payload);
    await setDoc(doc(firestoreDb, 'projects', project.id), project, { merge: true }).catch(
      () => null
    );
    return project;
  },

  async deleteProject(id: string): Promise<void> {
    await api.projects.delete(id);
    await deleteDoc(doc(firestoreDb, 'projects', id)).catch(() => null);
  },

  // Handover Sessions, Sources, Insights, Approvals
  async listHandoverSessions(): Promise<Handover[]> {
    const { handovers } = await api.handovers.list();
    return handovers;
  },

  async getHandoverSession(id: string): Promise<{
    handover: Handover;
    project: Project | null;
    sources: SourceDocument[];
    reportItems: ReportItem[];
  }> {
    return api.handovers.get(id);
  },

  async createHandoverSession(payload: Partial<Handover>): Promise<Handover> {
    const { handover } = await api.handovers.create(payload);
    await setDoc(doc(firestoreDb, 'handoverSessions', handover.id), handover).catch(
      () => null
    );
    return handover;
  },

  async publishHandoverReport(
    handoverId: string,
    leaderComments?: string
  ): Promise<Handover> {
    const { handover } = await api.handovers.publish(handoverId, leaderComments);
    await setDoc(doc(firestoreDb, 'handoverSessions', handover.id), handover, {
      merge: true,
    }).catch(() => null);
    return handover;
  },

  async requestHandoverRevision(
    handoverId: string,
    comments?: string
  ): Promise<Handover> {
    const { handover } = await api.handovers.requestRevision(handoverId, comments);
    await setDoc(doc(firestoreDb, 'handoverSessions', handover.id), handover, {
      merge: true,
    }).catch(() => null);
    return handover;
  },

  // Audit Logs
  async listAuditLogs(): Promise<AuditLog[]> {
    const { logs } = await api.auditLogs.list();
    return logs;
  },

  // Direct Firestore SDK query helpers
  async getDocumentById<T>(collectionName: string, docId: string): Promise<T | null> {
    const snap = await getDoc(doc(firestoreDb, collectionName, docId));
    return snap.exists() ? (snap.data() as T) : null;
  },

  async queryByProject<T>(collectionName: string, projectId: string): Promise<T[]> {
    const q = query(
      collection(firestoreDb, collectionName),
      where('projectId', '==', projectId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as T);
  },
};


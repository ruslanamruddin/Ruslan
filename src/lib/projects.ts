import { getCollection, type CollectionEntry } from "astro:content";

export type ProjectEntry = CollectionEntry<"projects">;

export interface SerializedProject {
  title: string;
  slug: string;
  date: string;
  lastUpdated: string;
  type: ProjectEntry["data"]["type"];
  status: ProjectEntry["data"]["status"];
  tags: string[];
  summary: string;
  abstract: string;
  featuredImage: string | null;
  links: {
    github?: string;
    demo?: string;
    poster?: string;
    slides?: string;
    dataset?: string;
  };
  venueTarget: string | null;
  updates: Array<{
    date: string;
    note: string;
  }>;
  pinned: boolean;
}

export function compareRecentlyUpdated(a: ProjectEntry, b: ProjectEntry): number {
  return b.data.last_updated.getTime() - a.data.last_updated.getTime();
}

export function compareNewest(a: ProjectEntry, b: ProjectEntry): number {
  return b.data.date.getTime() - a.data.date.getTime();
}

export function compareOldest(a: ProjectEntry, b: ProjectEntry): number {
  return a.data.date.getTime() - b.data.date.getTime();
}

export function slugFromId(id: string): string {
  return id.replace(/\.(mdx?|md)$/, "");
}

export async function getProjects(): Promise<ProjectEntry[]> {
  const projects = await getCollection("projects");
  return projects.sort(compareRecentlyUpdated);
}

export function serializeProject(project: ProjectEntry): SerializedProject {
  return {
    title: project.data.title,
    slug: slugFromId(project.id),
    date: project.data.date.toISOString(),
    lastUpdated: project.data.last_updated.toISOString(),
    type: project.data.type,
    status: project.data.status,
    tags: project.data.tags,
    summary: project.data.summary,
    abstract: project.data.abstract,
    featuredImage: project.data.featured_image ?? null,
    links: project.data.links,
    venueTarget: project.data.venue_target ?? null,
    updates: project.data.updates.map((entry) => ({
      date: entry.date.toISOString(),
      note: entry.note,
    })),
    pinned: project.data.pinned ?? false,
  };
}

export function serializeProjects(projects: ProjectEntry[]): SerializedProject[] {
  return projects.map(serializeProject);
}

export function uniqueTags(projects: ProjectEntry[]): string[] {
  return [...new Set(projects.flatMap((project) => project.data.tags))].sort((a, b) => a.localeCompare(b));
}

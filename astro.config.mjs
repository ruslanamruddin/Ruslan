// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];
const owner = process.env.GITHUB_REPOSITORY_OWNER;
const isGitHubActions = process.env.GITHUB_ACTIONS === "true" && Boolean(repository);

const base = isGitHubActions && repository ? `/${repository}/` : "/";
const site =
  isGitHubActions && repository && owner
    ? `https://${owner}.github.io/${repository}/`
    : "http://localhost:4321/";

export default defineConfig({
  site,
  base,
  output: "static",
  trailingSlash: "always",
  integrations: [mdx()],
});

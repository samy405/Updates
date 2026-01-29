/**
 * Set document title and Open Graph meta tags for sharing and bookmarks.
 */
function ensureMeta(
  attr: "name" | "property",
  key: string,
  value: string
): void {
  const selector =
    attr === "name"
      ? `meta[name="${key}"]`
      : `meta[property="${key}"]`;
  let el = document.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    if (attr === "name") el.setAttribute("name", key);
    else el.setAttribute("property", key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

export interface PageMetaOptions {
  title: string;
  description?: string;
  ogImage?: string;
}

export function setPageMeta({
  title,
  description,
  ogImage,
}: PageMetaOptions): void {
  document.title = title;

  if (description) {
    ensureMeta("name", "description", description);
    ensureMeta("property", "og:description", description);
  }

  ensureMeta("property", "og:title", title);

  if (ogImage) {
    const absoluteUrl = ogImage.startsWith("http") ? ogImage : `${window.location.origin}${ogImage}`;
    ensureMeta("property", "og:image", absoluteUrl);
  }
}

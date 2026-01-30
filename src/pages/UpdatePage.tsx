import { useParams, Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import type { Update, UpdatesData } from "../types";
import { setPageMeta } from "../utils/pageMeta";
import UpdateDetailWithComments from "../components/UpdateDetailWithComments";
import "./UpdatePage.css";

export default function UpdatePage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const fromCategory = (location.state as { fromCategory?: string } | null)?.fromCategory ?? "All";
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);
  const update = updates.find((u) => u.id === id);

  useEffect(() => {
    const loadUpdates = async () => {
      try {
        const res = await fetch("/data/updates.json");
        const data: UpdatesData = await res.json();
        setUpdates(data.updates);
      } catch (err) {
        console.error("Failed to load updates:", err);
      } finally {
        setLoading(false);
      }
    };

    loadUpdates();
  }, []);

  // Document title and Open Graph for sharing
  useEffect(() => {
    if (update) {
      const description =
        update.body.replace(/\s+/g, " ").trim().slice(0, 160) +
        (update.body.length > 160 ? "…" : "");
      setPageMeta({
        title: `Update: ${update.title}`,
        description,
        ogImage: "/brand/fountain-logo.png",
      });
    }
  }, [update]);

  useEffect(() => {
    // Load giscus script (optional - configure at https://giscus.app)
    const script = document.createElement("script");
    script.src = "https://giscus.app/client.js";
    script.setAttribute("data-repo", "YOUR_REPO_OWNER/YOUR_REPO_NAME");
    script.setAttribute("data-repo-id", "YOUR_REPO_ID");
    script.setAttribute("data-category", "General");
    script.setAttribute("data-category-id", "YOUR_CATEGORY_ID");
    script.setAttribute("data-mapping", "pathname");
    script.setAttribute("data-strict", "0");
    script.setAttribute("data-reactions-enabled", "1");
    script.setAttribute("data-emit-metadata", "0");
    script.setAttribute("data-input-position", "bottom");
    script.setAttribute("data-theme", "light");
    script.setAttribute("data-lang", "en");
    script.setAttribute("crossorigin", "anonymous");
    script.async = true;

    const giscusContainer = document.getElementById("giscus-container");
    if (giscusContainer && !giscusContainer.querySelector("script")) {
      giscusContainer.appendChild(script);
    }

    return () => {
      const container = document.getElementById("giscus-container");
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [id]);

  if (loading) {
    return (
      <div className="update-page">
        <div className="update-page-container">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!update) {
    return (
      <div className="update-page">
        <div className="update-page-container">
          <h1>Update not found</h1>
          <Link to="/" state={{ category: fromCategory }} className="btn btn-primary">
            ← Back to all updates
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="update-page">
      <div className="update-page-container">
        <Link to="/" state={{ category: fromCategory }} className="back-link">
          ← Back to all updates
        </Link>

        <div className="update-content">
          <UpdateDetailWithComments update={update} updates={updates} />
        </div>

        <div id="giscus-container" aria-hidden="true" />
      </div>
    </div>
  );
}

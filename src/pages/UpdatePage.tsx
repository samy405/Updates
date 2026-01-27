import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Update, UpdatesData } from "../types";
import "./UpdatePage.css";

export default function UpdatePage() {
  const { id } = useParams<{ id: string }>();
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);
  const update = updates.find((u) => u.id === id);

  useEffect(() => {
    // Load updates data
    fetch("/data/updates.json")
      .then((res) => res.json())
      .then((data: UpdatesData) => {
        setUpdates(data.updates);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load updates:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    // Load giscus script
    // IMPORTANT: Configure giscus at https://giscus.app and update the values below
    const script = document.createElement("script");
    script.src = "https://giscus.app/client.js";
    script.setAttribute("data-repo", "YOUR_REPO_OWNER/YOUR_REPO_NAME"); // TODO: Update with actual repo (e.g., "username/repo")
    script.setAttribute("data-repo-id", "YOUR_REPO_ID"); // TODO: Update with actual repo ID from giscus.app
    script.setAttribute("data-category", "General");
    script.setAttribute("data-category-id", "YOUR_CATEGORY_ID"); // TODO: Update with actual category ID from giscus.app
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
      // Cleanup: remove script and clear container on unmount
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
          <Link to="/" className="btn btn-primary">
            ← Back to Updates
          </Link>
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const supersededUpdate = update.supersededById
    ? updates.find((u) => u.id === update.supersededById)
    : null;

  return (
    <div className="update-page">
      <div className="update-page-container">
        <Link to="/" className="back-link">
          ← Back to Updates
        </Link>

        <article className="update-content">
          <header className="update-header">
            <div className="update-header-top">
              <h1>{update.title}</h1>
              {update.needsAnswer && (
                <span className="needs-answer-badge">Needs answer</span>
              )}
              {update.status === "superseded" && (
                <span className="superseded-badge">Superseded</span>
              )}
            </div>
            <div className="update-meta">
              <span className="update-meta-item">
                <strong>Date:</strong> {formatDate(update.datePosted)}
              </span>
              <span className="update-meta-item">
                <strong>Author:</strong> {update.author}
              </span>
              <span className="update-meta-item">
                <strong>Category:</strong> {update.category}
              </span>
            </div>
          </header>

          {supersededUpdate && (
            <div className="superseded-notice">
              <p>
                <strong>Note:</strong> This update has been superseded by{" "}
                <Link to={`/update/${update.supersededById}`}>
                  an update from {formatDate(supersededUpdate.datePosted)}
                </Link>
              </p>
            </div>
          )}

          {update.supersedesIds.length > 0 && (
            <div className="replaces-notice">
              <p>
                <strong>Replaces:</strong> This update replaces{" "}
                {update.supersedesIds.length} previous update
                {update.supersedesIds.length !== 1 ? "s" : ""}:
              </p>
              <ul>
                {update.supersedesIds.map((supersededId) => {
                  const superseded = updates.find((u) => u.id === supersededId);
                  return superseded ? (
                    <li key={supersededId}>
                      <Link to={`/update/${supersededId}`}>
                        {superseded.title} ({formatDate(superseded.datePosted)})
                      </Link>
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          )}

          <div className="update-body">
            <h2>Details</h2>
            <div className="update-body-content">
              {update.body.split("\n").map((paragraph, idx) => (
                <p key={idx}>{paragraph}</p>
              ))}
            </div>
          </div>

          <div className="update-source">
            <h2>Source Excerpt</h2>
            <blockquote>{update.sourceExcerpt}</blockquote>
          </div>

          <div className="update-discussion">
            <h2>Discussion</h2>
            <div id="giscus-container"></div>
          </div>
        </article>
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";
import type { Update, UpdateCategory } from "../types";
import { extractSummary } from "../utils/summary";
import "./UpdateCard.css";

interface UpdateCardProps {
  update: Update;
  selectedCategory?: UpdateCategory | "All";
  commentCount?: number;
  /** When provided, Quick view opens the side panel instead of navigating */
  onDiscussClick?: (updateId: string) => void;
}

export default function UpdateCard({ update, selectedCategory = "All", commentCount = 0, onDiscussClick }: UpdateCardProps) {
  const isSuperseded = update.status === "superseded";
  const summary = extractSummary(update.body);
  const isTruncated = update.body.length > summary.length;

  return (
    <div className={`update-card ${isSuperseded ? "superseded" : ""}`}>
      <div className="update-card-header">
        <div className="update-card-title-row">
          <h3 className="update-card-title">{update.title}</h3>
          <div className="update-badges">
            {update.needsAnswer && !isSuperseded && (
              <span className="needs-answer-badge">Needs answer</span>
            )}
            {isSuperseded && (
              <span className="superseded-badge">Superseded</span>
            )}
          </div>
        </div>
        <div className="update-card-meta">
          <span className="update-meta-item">
            <span className="update-meta-label">Category:</span>
            <span className="update-category">{update.category}</span>
          </span>
          {commentCount > 0 && (
            <span className="update-meta-item update-comment-count" aria-label={`${commentCount} comment${commentCount !== 1 ? "s" : ""}`}>
              <span className="update-meta-label">Comments:</span>
              <span className="update-comment-badge">{commentCount}</span>
            </span>
          )}
        </div>
      </div>

      <p className="update-card-summary">
        {summary}
        {isTruncated && <span className="summary-ellipsis">…</span>}
      </p>

      {isSuperseded && update.supersededById && (
        <div className="superseded-notice">
          <p>
            <strong>Note:</strong> This update has been superseded.{" "}
            <Link to={`/update/${update.supersededById}`} state={{ fromCategory: selectedCategory }}>
              View replacement update →
            </Link>
          </p>
        </div>
      )}

      {update.supersedesIds.length > 0 && (
        <div className="replaces-info">
          <p>
            <strong>Replaces:</strong> This update supersedes {update.supersedesIds.length} previous update{update.supersedesIds.length !== 1 ? "s" : ""}.
          </p>
        </div>
      )}

      <div className="update-card-actions">
        <Link to={`/update/${update.id}`} state={{ fromCategory: selectedCategory }} className="btn btn-primary">
          View
        </Link>
        {onDiscussClick ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onDiscussClick(update.id)}
          >
            Quick view
          </button>
        ) : (
          <Link to={`/update/${update.id}#comments`} state={{ fromCategory: selectedCategory }} className="btn btn-secondary">
            Discuss
          </Link>
        )}
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";
import { Update } from "../types";
import "./UpdateCard.css";

interface UpdateCardProps {
  update: Update;
}

export default function UpdateCard({ update }: UpdateCardProps) {
  const isSuperseded = update.status === "superseded";

  return (
    <div className={`update-card ${isSuperseded ? "superseded" : ""}`}>
      <div className="update-card-header">
        <div className="update-card-title-row">
          <h3 className="update-card-title">{update.title}</h3>
          {update.needsAnswer && !isSuperseded && (
            <span className="needs-answer-badge">Needs answer</span>
          )}
          {isSuperseded && (
            <span className="superseded-badge">Superseded</span>
          )}
        </div>
        <div className="update-card-meta">
          <span className="update-author">{update.author}</span>
          <span className="update-category">{update.category}</span>
        </div>
      </div>

      <p className="update-card-summary">
        {update.body.substring(0, 150)}
        {update.body.length > 150 ? "..." : ""}
      </p>

      {isSuperseded && update.supersededById && (
        <div className="superseded-link">
          <Link to={`/update/${update.supersededById}`}>
            → Replaced by update from {new Date(update.datePosted).toLocaleDateString()}
          </Link>
        </div>
      )}

      {update.supersedesIds.length > 0 && (
        <div className="replaces-info">
          Replaces {update.supersedesIds.length} previous update{update.supersedesIds.length !== 1 ? "s" : ""}
        </div>
      )}

      <div className="update-card-actions">
        <Link to={`/update/${update.id}`} className="btn btn-primary">
          View
        </Link>
        <Link to={`/update/${update.id}`} className="btn btn-secondary">
          Discuss
        </Link>
      </div>
    </div>
  );
}

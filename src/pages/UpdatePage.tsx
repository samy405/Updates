import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import type { Update, UpdatesData } from "../types";
import { supabase } from "../utils/supabaseClient";
import "./UpdatePage.css";

interface Comment {
  id: string;
  update_id: string;
  name: string | null;
  body: string;
  created_at: string;
}

export default function UpdatePage() {
  const { id } = useParams<{ id: string }>();
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentName, setCommentName] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmitTime, setLastSubmitTime] = useState<number | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleteInProgressId, setDeleteInProgressId] = useState<string | null>(null);
  const update = updates.find((u) => u.id === id);

  useEffect(() => {
    // Load updates data
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

  const reloadComments = async () => {
    if (!supabase || !update) return;

    setCommentsLoading(true);
    setCommentError(null);

    const { data, error } = await supabase
      .from("comments")
      .select("*")
      .eq("update_id", update.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to load comments:", error);
      setCommentError("Failed to load comments. Please try again later.");
    } else if (data) {
      setComments(data as Comment[]);
    }

    setCommentsLoading(false);
  };

  // Load comments for this update
  useEffect(() => {
    reloadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [update]);

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
            ← Back to all updates
          </Link>
        </div>
      </div>
    );
  }

  const supersededUpdate = update.supersededById
    ? updates.find((u) => u.id === update.supersededById)
    : null;

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !update) return;

    const now = Date.now();
    if (lastSubmitTime && now - lastSubmitTime < 2000) {
      // Simple client-side rate limit: 2 seconds between posts
      return;
    }

    const trimmedBody = commentBody.trim();
    const trimmedName = commentName.trim();

    if (!trimmedBody) {
      setCommentError("Comment cannot be empty.");
      return;
    }

    setSubmitting(true);
    setCommentError(null);

    const { error } = await supabase.from("comments").insert({
      update_id: update.id,
      name: trimmedName || null,
      body: trimmedBody,
    });

    if (error) {
      console.error("Failed to submit comment:", error);
      setCommentError("Failed to submit comment. Please try again.");
      setSubmitting(false);
      return;
    }

    // Clear form and refresh comments
    setCommentBody("");
    setLastSubmitTime(now);

    await reloadComments();
    setSubmitting(false);
  };

  const startEditingComment = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditingBody(comment.body);
    setCommentError(null);
  };

  const cancelEditingComment = () => {
    setEditingCommentId(null);
    setEditingBody("");
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!supabase || !update) return;

    const trimmed = editingBody.trim();
    if (!trimmed) {
      setCommentError("Comment cannot be empty.");
      return;
    }

    setEditSubmitting(true);
    setCommentError(null);

    const { error } = await supabase
      .from("comments")
      .update({ body: trimmed })
      .eq("id", commentId);

    if (error) {
      console.error("Failed to update comment:", error);
      setCommentError("Failed to update comment. Please try again.");
      setEditSubmitting(false);
      return;
    }

    setEditingCommentId(null);
    setEditingBody("");
    await reloadComments();
    setEditSubmitting(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!supabase || !update) return;

    const confirmed = window.confirm("Delete this comment?");
    if (!confirmed) return;

    setDeleteInProgressId(commentId);
    setCommentError(null);

    const { error } = await supabase.from("comments").delete().eq("id", commentId);

    if (error) {
      console.error("Failed to delete comment:", error);
      setCommentError("Failed to delete comment. Please try again.");
      setDeleteInProgressId(null);
      return;
    }

    await reloadComments();
    setDeleteInProgressId(null);
  };

  return (
    <div className="update-page">
      <div className="update-page-container">
        <Link to="/" className="back-link">
          ← Back to all updates
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
                <span className="update-meta-label">Category:</span>
                <span className="update-meta-value">{update.category}</span>
              </span>
            </div>
          </header>

          {supersededUpdate && (
            <div className="superseded-notice">
              <p>
                <strong>Note:</strong> This update has been superseded.{" "}
                <Link to={`/update/${update.supersededById}`}>
                  View replacement update →
                </Link>
              </p>
            </div>
          )}

          {update.supersedesIds.length > 0 && (
            <div className="replaces-notice">
              <p>
                <strong>Replaces:</strong> This update supersedes{" "}
                {update.supersedesIds.length} previous update
                {update.supersedesIds.length !== 1 ? "s" : ""}:
              </p>
              <ul>
                {update.supersedesIds.map((supersededId) => {
                  const superseded = updates.find((u) => u.id === supersededId);
                  return superseded ? (
                    <li key={supersededId}>
                      <Link to={`/update/${supersededId}`}>{superseded.title}</Link>
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          )}

          <div className="update-body">
            <h2>Details</h2>
            <div className="update-body-content">
              {update.body.split("\n").filter(p => p.trim()).map((paragraph, idx) => (
                <p key={idx}>{paragraph.trim()}</p>
              ))}
            </div>
          </div>

          <div className="update-comments" id="comments">
            <h2>Comments</h2>
            {!supabase && (
              <p className="discussion-note">
                Comments are currently disabled. Supabase configuration is missing.
              </p>
            )}
            {supabase && (
              <>
                {commentError && (
                  <p className="discussion-error" style={{ color: "var(--accent)" }}>
                    {commentError}
                  </p>
                )}
                {commentsLoading ? (
                  <p className="discussion-note">Loading comments...</p>
                ) : comments.length === 0 ? (
                  <p className="discussion-note">No comments yet. Be the first to comment.</p>
                ) : (
                  <ul className="comment-list">
                    {comments.map((comment) => (
                      <li key={comment.id} className="comment-item">
                        <div className="comment-header">
                          <span className="comment-author">
                            {comment.name?.trim() || "Anonymous"}
                          </span>
                        </div>
                        {editingCommentId === comment.id ? (
                          <>
                            <textarea
                              className="comment-edit-textarea"
                              value={editingBody}
                              onChange={(e) => setEditingBody(e.target.value)}
                              rows={3}
                            />
                            <div className="comment-actions">
                              <button
                                type="button"
                                className="btn btn-primary btn-small"
                                onClick={() => handleSaveEdit(comment.id)}
                                disabled={editSubmitting}
                              >
                                {editSubmitting ? "Saving..." : "Save"}
                              </button>
                              <button
                                type="button"
                                className="btn-link btn-small"
                                onClick={cancelEditingComment}
                                disabled={editSubmitting}
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="comment-body">{comment.body}</p>
                            <div className="comment-actions">
                              <button
                                type="button"
                                className="btn-link btn-small"
                                onClick={() => startEditingComment(comment)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn-link btn-small comment-delete"
                                onClick={() => handleDeleteComment(comment.id)}
                                disabled={deleteInProgressId === comment.id}
                              >
                                {deleteInProgressId === comment.id ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="comment-form-wrapper">
                  <h3 className="comment-form-title">Add a comment</h3>
                  <form className="comment-form" onSubmit={handleSubmitComment}>
                    <div className="form-row">
                      <label htmlFor="comment-name">Name (optional)</label>
                      <input
                        id="comment-name"
                        type="text"
                        value={commentName}
                        onChange={(e) => setCommentName(e.target.value)}
                        placeholder="Your name"
                      />
                    </div>
                    <div className="form-row">
                      <label htmlFor="comment-body">Comment</label>
                      <textarea
                        id="comment-body"
                        value={commentBody}
                        onChange={(e) => setCommentBody(e.target.value)}
                        placeholder="Share context, questions, or clarifications for CS agents..."
                        rows={4}
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={submitting}
                    >
                      {submitting ? "Posting..." : "Post comment"}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}

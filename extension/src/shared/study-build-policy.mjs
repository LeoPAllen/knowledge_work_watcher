export const STUDY_BUILD_POLICY = Object.freeze({
  capture_profile: "study_expanded",
  llm_response_text: true,
  search_snippets: true,
  search_full_urls: true,
});

export function expandedCaptureEnabled(context) {
  return (
    context?.capture_status === "active" &&
    typeof context.participant_id_hash === "string" &&
    /^[a-f0-9]{64}$/.test(context.participant_id_hash) &&
    typeof context.session_id === "string" &&
    context.session_id.length > 0 &&
    STUDY_BUILD_POLICY.llm_response_text &&
    STUDY_BUILD_POLICY.search_snippets &&
    STUDY_BUILD_POLICY.search_full_urls
  );
}

type AssignmentInstructions = {
  kind?: string;
  description?: string | null;
  descriptionHtml?: string | null;
  submissionTypes?: string[];
};

// Require an instruction about the whole task. "No file upload" alone can
// still mean a quiz, external tool, paper hand-in, or another required response.
export function needsNoSubmission(item: AssignmentInstructions): boolean {
  if (item.kind && item.kind !== "assignment") return false;
  const text = `${item.description ?? ""} ${item.descriptionHtml ?? ""}`
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&#39;|&apos;|’/gi, "'")
    .replace(/\s+/g, " ").toLowerCase();
  return /\bnothing (?:needs to be|has to be|is required to be|must be) (?:submitted|turned in|handed in)\b/.test(text)
    || /\b(?:you )?(?:do not|don't) (?:need|have) to (?:submit|turn in|hand in) (?:anything|this (?:assignment|activity|reading|task))\b/.test(text)
    || /\bno (?:submission|submissions) (?:is |are )?(?:needed|required|necessary)\b/.test(text)
    || /\b(?:this (?:assignment|activity|reading|task)|nothing) (?:does not|doesn't) require (?:a )?submission\b/.test(text)
    || /\b(?:nothing|no work) to (?:submit|turn in|hand in)\b/.test(text)
    || /\b(?:for (?:your )?(?:reading|review|reference|information) only|just (?:read|review)[^.!?]{0,80}nothing to (?:submit|turn in))\b/.test(text)
    || item.submissionTypes?.includes("none") === true;
}

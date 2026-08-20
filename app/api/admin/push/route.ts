import { getAppEnv, getChatAudioBucket } from "../../../../db";
import { familyUnauthorizedResponse, readFamilySession } from "../../../../lib/family-auth";
import { isAuthorizedAppRequest, unauthorizedAppResponse } from "../../../../lib/request-auth";

const sounds = new Set(["school_chime", "school_bell", "school_alert", "greatpower", "longbell"]);
const soundChannels: Record<string, string> = {
  school_chime: "02629372-0a08-4298-aed2-2fdb18b3493f",
  school_bell: "b3aa0a8e-0026-41fb-bb49-f13956d6530f",
  school_alert: "6d45a575-b748-4cef-ab8d-47216ce748d6",
  greatpower: "c6b29628-9251-4eb1-891c-4d21bab2fbf7",
  longbell: "44238e50-458b-4d3b-94cf-2c8d26d61f44",
};
const SCHOOL_APP_URL = "https://beauvizenor.com/school/";
const clean = (value: FormDataEntryValue | null, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: Request) {
  if (!isAuthorizedAppRequest(request)) return unauthorizedAppResponse();
  if (!await readFamilySession(request)) return familyUnauthorizedResponse();
  try {
    const form = await request.formData();
    const title = clean(form.get("title"), 120), message = clean(form.get("message"), 500);
    const buttonLabel = clean(form.get("buttonLabel"), 30) || "Open School";
    const sound = clean(form.get("sound"), 40), sendAfter = clean(form.get("sendAfter"), 80), action = clean(form.get("action"), 20);
    if (!title || !message || !sounds.has(sound)) return Response.json({ error: "Add a subject, message, and valid sound." }, { status: 400 });
    let imageUrl: string | undefined;
    const image = form.get("image");
    if (image instanceof File && image.size) {
      if (!image.type.startsWith("image/") || image.size > 8_000_000) return Response.json({ error: "Choose an image under 8 MB." }, { status: 400 });
      const id = crypto.randomUUID();
      await getChatAudioBucket().put(`push-images/${id}`, image.stream(), { httpMetadata: { contentType: image.type } });
      const canonicalImageUrl = new URL("api/admin/push-image", SCHOOL_APP_URL);
      canonicalImageUrl.searchParams.set("id", id);
      imageUrl = canonicalImageUrl.toString();
    }
    const env = getAppEnv();
    if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_REST_API_KEY) throw new Error("OneSignal is not configured on the server.");
    // The Android click listener opens this Additional Data URL inside School.
    // A OneSignal Launch URL would make Android open an external browser instead.
    const payload: Record<string, unknown> = {
      app_id: env.ONESIGNAL_APP_ID, target_channel: "push", included_segments: ["Total Subscriptions"],
      headings: { en: title }, contents: { en: message }, android_channel_id: soundChannels[sound],
      data: { urgent_overlay: true, overlay_image: imageUrl || "", target_url: SCHOOL_APP_URL, button_label: buttonLabel },
      buttons: [{ id: "open_school", text: buttonLabel }],
    };
    if (imageUrl) { payload.big_picture = imageUrl; payload.large_icon = imageUrl; }
    if (action === "schedule") {
      if (!sendAfter) return Response.json({ error: "Choose a date and time to schedule the notification." }, { status: 400 });
      const scheduled = new Date(sendAfter);
      if (!Number.isFinite(scheduled.getTime()) || scheduled.getTime() < Date.now() + 10_000) return Response.json({ error: "Choose a scheduled time that is still in the future." }, { status: 400 });
      payload.send_after = scheduled.toISOString();
    }
    const response = await fetch("https://api.onesignal.com/notifications?c=push", { method: "POST", headers: { Authorization: `Key ${env.ONESIGNAL_REST_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json() as { id?: string; errors?: unknown };
    if (!response.ok || !result.id) throw new Error(`OneSignal rejected the notification${result.errors ? `: ${JSON.stringify(result.errors)}` : "."}`);
    return Response.json({ ok: true, id: result.id, scheduled: action === "schedule" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The notification could not be created." }, { status: 500 });
  }
}

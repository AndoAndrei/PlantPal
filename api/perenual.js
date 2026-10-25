// Looks up a plant in the Perenual database and returns a cleaned care summary.
// Needs the PERENUAL_API_KEY environment variable. Plant data: https://perenual.com
const BASE = "https://perenual.com/api/v2";
const GUIDE_URL = "https://perenual.com/api/species-care-guide-list";
// The current plan only unlocks details and care guides for species IDs 1 to 3000.
const FREE_MAX_ID = 3000;
const LOCKED = /upgrade|subscription|premium|supreme/i;

// Free-tier responses replace locked fields with an "Upgrade Plans..." string, so drop those.
const clean = (v) => (typeof v === "string" && !LOCKED.test(v) ? v.replace(/^[\s"]+|[\s"]+$/g, "") : "");
const cleanList = (v) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);

const norm = (s) =>
  String(s || "").toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/['\u2018\u2019"].*?['\u2018\u2019"]/g, " ")
    .replace(/\u00d7/g, " ")
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/).filter((w) => w && w !== "x" && w !== "spp")
    .slice(0, 2).join(" ");

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.PERENUAL_API_KEY;
  if (!key) return res.status(501).json({ error: "not_configured" });

  const sci = norm(req.query.q);
  const common = String(req.query.common || "").trim().slice(0, 80);
  if (!sci && !common) return res.status(400).json({ error: "Missing q" });

  const search = async (q) => {
    const r = await fetch(`${BASE}/species-list?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}`);
    if (r.status === 429) { const e = new Error("rate_limited"); e.status = 429; throw e; }
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.data) ? j.data : [];
  };

  try {
    const genus = sci.split(" ")[0];
    let byCommon = false;
    let list = sci ? await search(sci) : [];
    if (!list.length && genus && genus !== sci) list = await search(genus);
    if (!list.length && common) { list = await search(common); byCommon = true; }
    if (!list.length) {
      res.setHeader("Cache-Control", "public, s-maxage=86400");
      return res.status(200).json({ found: false });
    }

    const namesOf = (r) => (Array.isArray(r.scientific_name) ? r.scientific_name : [r.scientific_name]).map(norm);
    let hit = list.find((r) => namesOf(r).includes(sci));
    const exact = !!hit;
    if (!hit && genus) hit = list.find((r) => namesOf(r).some((n) => n.split(" ")[0] === genus));
    if (!hit && byCommon) hit = list[0];
    if (!hit) {
      res.setHeader("Cache-Control", "public, s-maxage=86400");
      return res.status(200).json({ found: false });
    }

    // Details and care guides are only unlocked for IDs up to FREE_MAX_ID, so skip the
    // extra requests (and save the daily quota) for anything above that.
    let d = null;
    const guide = {};
    if (hit.id <= FREE_MAX_ID) {
      const getJSON = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const [details, care] = await Promise.all([
        getJSON(`${BASE}/species/details/${hit.id}?key=${encodeURIComponent(key)}`),
        getJSON(`${GUIDE_URL}?key=${encodeURIComponent(key)}&species_id=${hit.id}`)
      ]);
      if (details && details.id) d = details;
      const sections = care && Array.isArray(care.data) && care.data[0] && Array.isArray(care.data[0].section) ? care.data[0].section : [];
      for (const s of sections) {
        if (s && ["watering", "sunlight", "pruning"].includes(s.type)) {
          const t = clean(s.description);
          if (t) guide[s.type] = t;
        }
      }
    }

    const text = (k) => clean(d && d[k]) || clean(hit[k]);
    const list_ = (k) => { const a = cleanList(d && d[k]); return a.length ? a : cleanList(hit[k]); };
    const bench = d && d.watering_general_benchmark;
    const sciNames = cleanList(d && d.scientific_name).length ? cleanList(d.scientific_name) : cleanList(hit.scientific_name);
    const indoorRaw = d && typeof d.indoor === "boolean" ? d.indoor : null;

    res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=2592000");
    return res.status(200).json({
      found: true,
      matched_exact: exact,
      id: hit.id,
      common_name: text("common_name"),
      scientific_name: sciNames[0] || "",
      cycle: text("cycle"),
      watering: text("watering"),
      watering_days: bench ? clean(bench.value) : "",
      sunlight: list_("sunlight"),
      pruning_month: list_("pruning_month"),
      indoor: indoorRaw,
      care_level: text("care_level"),
      growth_rate: text("growth_rate"),
      maintenance: text("maintenance"),
      description: text("description"),
      guide_watering: guide.watering || "",
      guide_sunlight: guide.sunlight || "",
      guide_pruning: guide.pruning || ""
    });
  } catch (err) {
    if (err.status === 429) return res.status(429).json({ error: "rate_limited" });
    return res.status(502).json({ error: "Could not reach Perenual", detail: err.message });
  }
}

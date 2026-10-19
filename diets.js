// Gluten-free and dairy-free: is a recipe already free of it, can it be made free with store-bought swaps
// that cook the same way, or not? And the swapped recipe itself. Ingredient-by-ingredient, no AI.

// rule: [what it catches, what to buy instead (or a function of the ingredient name), how the steps say it, the new word]
// A rule with no "instead" means there's no simple swap, so the recipe can't be converted.
const R = (re, instead, step, word) => ({ re, instead, step, word });
// "Italian breadcrumbs" → "Gluten-free Italian breadcrumbs", "Hamburger buns" → "Gluten-free hamburger buns"
const lc = t => /^(Mexican|Monterey|Swiss|Parmesan|Pecorino|Italian|Greek|Caesar|Portuguese|English|Korean|Japanese|Thai|Ritz)\b/.test(t) ? t : t.replace(/^\w/, c => c.toLowerCase());
const gfName = item => "Gluten-free " + lc(item.replace(/^gluten-free /i, ""));
const dfName = item => "Dairy-free " + lc(item.replace(/^(shredded |sliced |grated )/i, ""));
const PASTA = /spaghetti|linguine|fettuccine|penne|ziti|macaroni|tagliatelle|bucatini|rigatoni|rotini|shells|lasagna|orzo|ditalini|egg noodles|pasta/i;

export const DIETS = {
  gf: {
    key: "gf", e: "🌾", name: "Gluten-free", make: "Make it gluten-free",
    note: "Gluten-free: check labels on broth, sausage, seasoning packets and spice blends. Most are gluten-free, but not all.",
    // already safe even though the name looks risky
    safe: /gluten-free|rice noodles|rice paper|sweet potato noodles|glass noodles|corn tortillas|tortilla chips|corn chips|fritos|taco shells|tostada|cornstarch|cornmeal|rice flour|almond flour|tamari|coconut aminos|korean rice cakes|potato starch|grits/i,
    rules: [
      R(/^dark soy sauce$/i, "Tamari plus 1 tsp molasses", /\bdark soy sauce\b/gi, "tamari"),
      R(/soy sauce/i, "Tamari (gluten-free soy sauce)", /\bsoy( sauces?)?\b/gi, "tamari"),
      R(/teriyaki sauce|hoisin|oyster sauce|worcestershire|gochujang|onion soup mix|cream of |bbq sauce|barbecue sauce|frozen meatballs|breaded chicken|ladyfingers|pie crust|pizza dough|graham cracker|croutons|crackers|saltines?|ritz|breadcrumbs|panko|beer|miso/i, gfName),
      R(/^(all-purpose )?flour$/i, "Gluten-free 1-to-1 flour blend"),
      R(/tortillas/i, "Gluten-free tortillas"),
      R(/bread|buns|rolls|hoagie|pita|naan|croissants?|english muffins?|bagels?|\brye\b/i, gfName),
      R(/lo mein noodles|ramen|yakisoba|udon/i, "Rice noodles", /\b(lo mein |ramen |yakisoba |udon )?noodles\b|\budon\b|\bramen\b/gi, "rice noodles"),
      R(/wonton strips|chow mein noodles/i, "Crispy rice noodles"),
      R(PASTA, gfName),
      R(/malt vinegar/i, "Apple cider vinegar"),
      // no easy swap
      R(/couscous|phyllo|dumpling wrappers|wonton wrappers|fish cakes|curry roux|seitan|barley|cake mix|biscuit mix|pancake mix|stuffing/i, null),
      R(/flour|noodles/i, null)
    ]
  },
  df: {
    key: "df", e: "🥛", name: "Dairy-free", make: "Make it dairy-free",
    note: "Dairy-free: check labels on bread, sausage and sauces for milk.",
    safe: /coconut milk|coconut cream|almond milk|oat milk|soy milk|dairy-free|vegan|peanut butter|butter lettuce|butternut|cocoa|cream of tartar|coconut|cashew cream/i,
    rules: [
      R(/buttermilk/i, "Oat milk plus 1 tbsp lemon juice per cup", /\bbuttermilk\b/gi, "oat milk mixture"),
      R(/sweetened condensed milk/i, "Sweetened condensed coconut milk"),
      R(/evaporated milk/i, "Full-fat coconut milk", /\bevaporated milk\b/gi, "coconut milk"),
      R(/heavy cream|whipping cream/i, "Full-fat coconut milk", /(?<!(sour|ice|cashew|whipped) )\b(heavy |whipping )?cream\b(?! cheese)/gi, "coconut milk"),
      R(/half-and-half/i, "Unsweetened oat milk", /\bhalf-and-half\b/gi, "oat milk"),
      R(/\bmilk\b/i, "Unsweetened oat milk", /(?<!(coconut|oat|almond|soy) )\bmilk\b/gi, "oat milk"),
      R(/ghee/i, "Avocado oil", /\bghee\b/gi, "oil"),
      R(/butter/i, "Dairy-free butter"),
      R(/paneer/i, "Extra-firm tofu", /\bpaneer\b/gi, "tofu"),
      R(/mascarpone/i, null),
      R(/sour cream|crema|yogurt|pesto|cream of |cream cheese|ricotta|feta|parmesan|pecorino|kefalotyri|mozzarella|provolone|swiss|cheddar|monterey|pepper jack|colby|queso|cotija|blue cheese|cheese|ranch|caesar dressing|ice cream|whipped cream|chocolate/i, dfName)
    ]
  }
};
export const DIET_KEYS = Object.keys(DIETS);
const nameOf = i => typeof i === "string" ? i : i.item || "";
// known(item, key) can answer from a scanned product's label: "free" (e.g. certified gluten-free, or no gluten in
// its allergens) or "contains" (its label lists gluten / milk). Otherwise the ingredient name decides.
const ruleFor = (d, n, known) => {
  const k = known ? known(n, d.key) : null;
  if (k === "free") return null;
  const r = d.safe.test(n) ? null : d.rules.find(x => x.re.test(n));
  if (r) return r;
  return k === "contains" ? { instead: d.key === "gf" ? gfName : dfName } : null;   // e.g. a taco seasoning whose label lists wheat
};
// For one diet: "yes" (already fine), "swap" (fine after swaps), or "no".
export function dietStatus(ingredients, key, known) {
  const d = DIETS[key];
  let swap = false;
  for (const i of ingredients || []) {
    const n = nameOf(i);
    if (!n) continue;
    const r = ruleFor(d, n, known);
    if (!r) continue;
    if (!r.instead) return "no";
    swap = true;
  }
  return swap ? "swap" : "yes";
}
const keepCase = (was, word) => /^[A-Z]/.test(was) ? word.charAt(0).toUpperCase() + word.slice(1) : word;
// The recipe with every swap for this diet made, steps reworded to match, and a line about label-checking.
export function applyDiet(r, key, known) {
  const d = DIETS[key];
  let steps = r.steps.slice();
  const ingredients = r.ingredients.map(i => {
    const n = nameOf(i);
    if (!n) return i;
    const rule = ruleFor(d, n, known);
    if (!rule || !rule.instead) return i;
    const item = typeof rule.instead === "function" ? rule.instead(n) : rule.instead;
    if (rule.step && rule.word) steps = steps.map(t => t.replace(rule.step, w => keepCase(w, rule.word)));
    // gluten-free pasta cooks for its own time: point to the package instead of the old number
    if (key === "gf" && (PASTA.test(n) || /noodles|ramen|udon/i.test(n)))
      steps = steps.map(t => /\b(boil|cook|soak)/i.test(t) && /pasta|noodle|spaghetti|linguine|fettuccine|penne|ziti|macaroni|shells|lasagna|orzo|ditalini|udon|ramen/i.test(t)
        ? t.replace(/\bfor (about )?\d+( to \d+)? minutes\b/i, "for the time on the package") : t);
    return { ...i, item, have: false };
  });
  if (!steps.includes(d.note)) steps.push(d.note);
  return { ...r, ingredients, steps, diets: [...new Set([...(r.diets || []), key])] };
}

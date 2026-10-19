// Rough nutrition per serving, worked out from a recipe's ingredient list. No AI, no lookups: a table of
// common foods (per 100 g) and how much a cup, a can, a slice or "one" of each weighs.
// It's an estimate (good to about ±20%), meant for sorting meals into High protein / Lighter / Low carb
// and for a quick guide on each recipe, not for counting exact macros.

// [match, kcal, protein g, carbs g, sizes] — all per 100 g. First match wins, so specific foods come first.
// sizes: cup / each / slice / can / pack (grams), drain (share left after draining a can), fry (deep-frying oil)
const F = (re, kcal, p, c, s = {}) => ({ re, kcal, p, c, ...s });
const FOODS = [
  F(/corned beef/i, 200, 15, 0),
  // things that look like foods but add next to nothing
  F(/\b(broth|stock|bouillon|water|vinegar|soy sauce|tamari|aminos|fish sauce|oyster sauce|hot sauce|sriracha|worcestershire|mustard|extract|vanilla|seasoning|spice|\bsalt\b(?! cod)|pepper(corns)?\b(?! jack)|powder(?<!cocoa powder)|paprika|cumin|oregano|thyme|basil(?! pesto)|parsley|cilantro|dill|mint|chives|rosemary|bay lea|cinnamon|nutmeg|garlic|ginger|chil(i|e)s?\b(?! (bean|paste))|jalape|lemon|lime|wine|vodka|sherry|marsala|coffee|yeast|baking|skewer|plank|ice cream|whipped cream|salsa verde|pickles?|sauerkraut|kimchi|capers|clam juice)/i, 0, 0, 0),
  F(/sweet potato noodles|glass noodles|rice noodles/i, 360, 6, 80),
  F(/korean rice cakes|tteok/i, 230, 4, 50),
  F(/fish cakes/i, 100, 10, 10),
  F(/cooked (jasmine |white |brown )?rice/i, 130, 2.7, 28, { cup: 158 }),
  F(/\brice\b(?! vinegar| wine| cakes| noodles)|grits/i, 360, 7, 79, { cup: 185 }),
  F(/rhubarb/i, 21, 1, 4.5, { cup: 122 }), F(/barley/i, 352, 10, 78, { cup: 200 }), F(/molasses/i, 290, 0, 75, { cup: 337 }),
  F(/quinoa/i, 368, 14, 64, { cup: 170 }), F(/\boats\b/i, 389, 17, 66, { cup: 80 }),
  F(/ramen/i, 440, 10, 60, { each: 85, pack: 85 }), F(/udon/i, 130, 3, 27, { pack: 200 }), F(/yakisoba/i, 150, 5, 30, { pack: 170 }),
  F(/taco shells|tostada/i, 470, 6, 63, { each: 13 }),
  F(/lasagna noodles/i, 360, 13, 72, { each: 20 }),
  F(/orzo|couscous|ditalini|pasta|spaghetti|linguine|fettuccine|penne|ziti|macaroni|tagliatelle|bucatini|rigatoni|rotini|\bshells\b|noodles/i, 360, 13, 72, { cup: 100 }),
  F(/dumpling wrappers|wonton wrappers/i, 290, 9, 58, { each: 8 }), F(/wonton strips|chow mein noodles/i, 500, 8, 60, { cup: 45 }),
  F(/sweet potato/i, 86, 1.6, 20, { each: 130 }),
  F(/tater tots|hash browns/i, 190, 2, 24, { cup: 120 }), F(/potato sticks|potato chips/i, 530, 6, 52, { pack: 255 }),
  F(/potato/i, 77, 2, 17, { each: 213, cup: 150 }),
  F(/corn on the cob/i, 86, 3, 19, { each: 90 }),
  F(/corn chips|fritos|tortilla chips/i, 500, 7, 63, { pack: 340, cup: 30 }),
F(/corn tortillas/i, 218, 5.7, 45, { each: 26 }),
  F(/large flour tortillas/i, 300, 8, 50, { each: 70 }), F(/tortillas/i, 300, 8, 50, { each: 49 }),
  F(/english muffins?|bagels?/i, 235, 9, 46, { each: 60 }),
  F(/naan/i, 290, 9, 50, { each: 90 }), F(/pita/i, 275, 9, 56, { each: 60 }), F(/croissants?/i, 406, 8, 45, { each: 60 }),
  F(/hoagie|sub rolls/i, 270, 9, 50, { each: 85 }), F(/buns|rolls/i, 270, 9, 50, { each: 55 }),
  F(/croutons/i, 400, 10, 70, { cup: 30 }), F(/crusty bread|\bloaf\b/i, 270, 9, 50, { each: 450 }),
  F(/bread(?!crumbs)|\brye\b/i, 265, 9, 49, { slice: 30, each: 30 }),
  F(/pizza dough/i, 260, 8, 50), F(/phyllo/i, 300, 7, 53), F(/pie crust/i, 450, 5, 50, { each: 220 }),
  F(/graham cracker/i, 430, 7, 77, { cup: 85 }), F(/ladyfingers/i, 380, 8, 75),
  F(/crackers|saltines?|ritz/i, 480, 8, 65, { each: 3, pack: 113 }),
  F(/panko/i, 380, 13, 72, { cup: 60 }), F(/breadcrumbs/i, 395, 13, 72, { cup: 108 }),
  F(/cornstarch/i, 381, 0, 91, { cup: 128 }), F(/flour|cornmeal/i, 364, 10, 76, { cup: 125 }),
  F(/powdered sugar/i, 389, 0, 100, { cup: 120 }), F(/brown sugar/i, 380, 0, 98, { cup: 220 }), F(/sugar/i, 387, 0, 100, { cup: 200 }),
  F(/honey/i, 304, 0, 82, { cup: 340 }), F(/maple syrup/i, 260, 0, 67, { cup: 320 }),
  F(/curry roux/i, 500, 6, 45, { pack: 200 }), F(/gochujang/i, 220, 5, 45, { cup: 288 }), F(/miso/i, 200, 12, 26, { cup: 275 }),
  F(/ketchup|bbq sauce|barbecue sauce|hoisin|sweet chili|teriyaki sauce|cocktail sauce/i, 110, 1, 26, { cup: 270 }),
  F(/marinara|pizza sauce/i, 50, 1.5, 8, { cup: 250, jar: 680 }),
  F(/tomato paste/i, 82, 4, 19, { cup: 262 }), F(/tomato|enchilada sauce|salsa|pumpkin/i, 25, 1.2, 5, { cup: 245, each: 120, can: 425, jar: 450 }),
  F(/sweetened condensed milk/i, 321, 8, 54, { can: 397, cup: 306 }), F(/evaporated milk/i, 134, 7, 10, { cup: 252 }),
  F(/coconut cream/i, 330, 3.6, 6.6, { cup: 240, can: 400 }), F(/coconut milk/i, 197, 2, 3, { cup: 240, can: 400 }),
  F(/cream cheese/i, 340, 6, 4, { pack: 227, cup: 232 }), F(/mascarpone/i, 430, 5, 4, { cup: 240 }), F(/ricotta/i, 170, 11, 3, { cup: 246 }),
  F(/cream of /i, 60, 1, 7, { can: 300 }), F(/sour cream|crema/i, 200, 2.4, 4.6, { cup: 230 }), F(/greek yogurt/i, 75, 10, 4, { cup: 245 }), F(/yogurt/i, 63, 3.5, 7, { cup: 245 }),
  F(/heavy cream|whipping cream/i, 340, 2.8, 2.7, { cup: 238 }), F(/half-and-half/i, 130, 3, 4.3, { cup: 242 }),
  F(/buttermilk/i, 40, 3.3, 4.8, { cup: 245 }), F(/\bmilk\b/i, 55, 3.4, 5, { cup: 244 }),
  F(/peanut butter/i, 590, 25, 20, { cup: 258 }),
  F(/butter(?! lettuce|nut|milk)|ghee/i, 717, 0.9, 0.1, { cup: 227, each: 113 }),
  F(/parmesan|pecorino|kefalotyri/i, 420, 36, 4, { cup: 100 }),
  F(/feta|queso fresco|blue cheese(?! (or|dressing))|cotija/i, 265, 14, 4, { cup: 150 }),
  F(/fresh mozzarella/i, 280, 18, 3, { each: 113 }), F(/mozzarella/i, 300, 22, 2, { cup: 113, slice: 21 }),
  F(/paneer/i, 320, 20, 4),
  F(/cheese/i, 400, 24, 2, { cup: 113, slice: 21, each: 21 }),
  F(/mayonnaise|\bmayo\b|aioli/i, 680, 1, 1, { cup: 220 }),
  F(/dressing(?! seasoning)|vinaigrette|tartar sauce/i, 430, 1, 8, { cup: 240 }),
  F(/pesto/i, 450, 5, 6, { cup: 240, jar: 170 }), F(/tahini/i, 595, 17, 21, { cup: 240 }),
  F(/sesame seeds/i, 570, 18, 23, { cup: 144 }),
  F(/sliced almonds/i, 580, 21, 22, { cup: 92 }), F(/peanuts|cashews|walnuts|pecans|almonds|pine nuts|\bnuts\b/i, 600, 20, 22, { cup: 140 }),
  F(/chocolate/i, 500, 5, 60, { cup: 170 }), F(/cocoa/i, 230, 20, 58, { cup: 86 }),
  F(/tuna/i, 150, 25, 0, { can: 112 }),
  F(/oil(?! spray)|shortening|lard/i, 884, 0, 0, { cup: 218, fry: true }),
  F(/avocado/i, 160, 2, 9, { each: 150 }), F(/olives/i, 115, 1, 6, { cup: 135 }),
  // protein
  F(/chicken wings/i, 203, 18, 0, { each: 30 }), F(/whole chicken/i, 140, 13, 0),
  F(/bone-in chicken|drumsticks|chicken pieces/i, 160, 13.5, 0, { each: 150 }),
  F(/breaded chicken/i, 250, 15, 15, { each: 45 }), F(/chicken tender/i, 110, 23, 0, { each: 50 }),
  F(/rotisserie chicken|cooked chicken/i, 190, 28, 0, { cup: 140, each: 420 }),
  F(/ground chicken/i, 143, 17.4, 0), F(/ground turkey|turkey breast/i, 150, 19, 0), F(/turkey bacon/i, 230, 17, 2, { slice: 15 }),
  F(/chicken thighs?/i, 145, 19.5, 0, { each: 110 }), F(/chicken/i, 120, 22.5, 0, { each: 225, cup: 140 }),
  F(/ground beef 80\/20/i, 254, 17, 0), F(/ground beef|ground lamb|\blamb\b|plant-based ground/i, 220, 18.5, 1),
  F(/short ribs/i, 200, 12, 0), F(/corned beef/i, 200, 15, 0), F(/ribeye|shaved beef/i, 270, 17, 0, { each: 340 }),
  F(/chuck|stew meat|brisket/i, 220, 19, 0),
  F(/flank|sirloin|skirt|steak|minute steaks/i, 165, 21, 0, { each: 225 }),
  F(/meatballs/i, 290, 14, 8),
  F(/pork belly/i, 518, 9, 0), F(/pork shoulder|pork butt/i, 230, 17, 0), F(/ground pork/i, 263, 17, 0),
  F(/sausage|chouri[çc]o|lingui[çc]a|kielbasa|andouille/i, 300, 14, 2, { each: 85 }),
  F(/pepperoni|salami/i, 500, 20, 1), F(/bacon|pancetta/i, 300, 12, 1, { slice: 28 }),
  F(/ham hock|ham bone/i, 100, 8, 0, { each: 300 }), F(/\bham\b|presunto|prosciutto/i, 145, 21, 1, { cup: 140, slice: 28 }),
  F(/pork/i, 145, 21, 0, { each: 170 }),
  F(/shrimp|prawns/i, 85, 20, 0), F(/salmon/i, 208, 20, 0, { each: 170 }),
  F(/catfish/i, 105, 18, 0, { each: 170 }),
  F(/cod\b|haddock|pollock|tilapia|white fish|monkfish|fish fillets|salt cod|bacalhau/i, 85, 19, 0, { each: 170 }),
  F(/littleneck|clams in shell|mussels/i, 13, 2, 0.5), F(/clams/i, 86, 15, 3, { can: 130 }),
  F(/crab|lobster/i, 85, 18, 0, { cup: 135 }), F(/scallops/i, 70, 12, 3),
  F(/tofu/i, 90, 10, 2, { pack: 397 }),
  F(/egg yolks?/i, 322, 16, 3.6, { each: 17 }), F(/\beggs?\b/i, 143, 12.6, 0.7, { each: 50 }),
  F(/green beans/i, 31, 1.8, 7, { cup: 110 }), F(/bean sprouts/i, 30, 3, 6, { cup: 104 }),
  F(/refried beans/i, 90, 5, 15, { can: 450 }),
  F(/dried.*beans|split peas|lentils/i, 350, 24, 60, { cup: 192 }),
  F(/chickpeas|beans|hominy/i, 120, 7.5, 20, { can: 425, drain: 0.6, cup: 170 }),
  // fruit
  F(/bananas?/i, 89, 1, 23, { each: 118 }), F(/apples?|pears?/i, 52, 0.3, 14, { each: 180 }),
  F(/juice|apple cider/i, 46, 0.5, 11, { cup: 248 }),
  F(/berries|grapes|cherries|mandarin|pineapple|mango|peach/i, 55, 0.7, 13, { cup: 150, can: 400, drain: 0.65 }),
  F(/oranges?/i, 47, 0.9, 12, { each: 130 }),
  // vegetables
  F(/peas|corn\b|mixed vegetables/i, 80, 4, 15, { cup: 145 }),
  F(/carrots?|onions?|shallots?|leeks?|beets?|turnip|rutabaga|squash|pumpkin/i, 40, 1, 9, { each: 110, cup: 130 }),
  F(/broccoli|cauliflower|cabbage|coleslaw|zucchini|eggplant|peppers?|celery|cucumber|mushrooms|asparagus|spinach|kale|lettuce|romaine|greens|tomatoes|radish|daikon|bok choy|snow peas|chard|arugula/i,
    25, 1.8, 5, { each: 250, cup: 70, head: 500 }),
  F(/beer/i, 43, 0.5, 3.6, { each: 355 })
];

const FR = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };
// "1 1/2" → 1.5, "1/3" → .333, "3–4" → 3
function num(s) {
  s = String(s).replace(/[½¼¾⅓⅔⅛]/g, m => " " + FR[m]).trim();
  const m = s.match(/^(\d+)\/(\d+)|^(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?/);
  if (!m) return null;
  let v = m[1] ? +m[1] / +m[2] : +m[3];
  if (m[4]) v += +m[4] / +m[5];
  else if (/^\d+\s+0?\.\d+/.test(s)) v += +s.split(/\s+/)[1];
  return { v, rest: s.slice(m[0].length).trim().replace(/^(to|-|–|or)\s*[\d\/ .]+(?=\s|$)/, "").trim() };
}
const OZ = 28.35, LB = 453.6;
const wt = (n, u) => (/^(lb|lbs|pounds?)$/i.test(u) ? n * LB : n * OZ);
// How many grams an amount like "2 cans (15 oz), drained" or "4 (6 oz each)" means for this food.
export function grams(amount, food) {
  const a = String(amount || "").toLowerCase().trim();
  if (!a || /^(to taste|to serve|optional|a pinch|pinch|for (dusting|the pan|serving))/.test(a)) return 0;
  if (food.fry && /for frying/.test(a)) return 55;                                 // deep-frying: about 1/4 cup soaks in
  if (food.fry && /^(\d+ )?(\d\/\d|\d+) cups?\b/.test(a) && (num(a) || {}).v >= 0.75) return 55;
  if (/^a handful|^a few/.test(a)) return 10;
  const n = num(a);
  if (!n) return 0;
  const { v, rest } = n;
  const each = rest.match(/\((?:about )?([\d .\/]+)\s*(oz|lb)s? each\)/);
  if (each) { const e = num(each[1]); return e ? v * wt(e.v, each[2]) : 0; }
  const unit = (rest.match(/^([a-z-]+)/) || [])[1] || "";
  const paren = rest.match(/\((?:about )?([\d .\/]+)\s*(oz|lb|lbs)\b/);
  const pw = paren ? (num(paren[1]) || { v: 0 }).v : 0;
  const per = paren ? wt(pw, paren[2]) : 0;
  const drained = food.drain && (/drained/.test(a) || /can/.test(unit) || /can/.test(rest)) ? food.drain : 1;
  if (/^(lb|lbs|pounds?)$/.test(unit)) return v * LB;
  if (/^(oz|ounces?)$/.test(unit)) return v * OZ * (/can|drained/.test(rest) ? drained : 1);
  if (/^(fl)$/.test(unit)) return v * 29.6;
  if (/^(g|grams?)$/.test(unit)) return v;
  if (/^(kg)$/.test(unit)) return v * 1000;
  if (/^cups?$/.test(unit)) return v * (food.cup || 200);
  if (/^(tbsp|tablespoons?)$/.test(unit)) return v * (food.cup || 200) / 16;
  if (/^(tsp|teaspoons?)$/.test(unit)) return v * (food.cup || 200) / 48;
  if (/^cans?$/.test(unit)) return v * (per || food.can || 425) * drained;
  if (/^jars?$/.test(unit)) return v * (per || food.jar || food.can || 450);
  if (/^(packets?|packages?|pkgs?|box(es)?|bags?|packs?|sleeves?|bottles?|blocks?)$/.test(unit)) return v * (per || food.pack || 250);
  if (/^(slices?)$/.test(unit)) return v * (food.slice || 28);
  if (/^(heads?)$/.test(unit)) return v * (food.head || food.each || 300);
  if (/^(pints?)$/.test(unit)) return v * 300;
  if (/^(cloves?|stalks?|sprigs?|leaves|inch)$/.test(unit)) return 0;
  if (/^(ears?)$/.test(unit)) return v * (food.each || 90);
  if (per && !/^(small|medium|large)/.test(unit)) return per;                       // "4 (about 1 1/2 lb)": the weight is the total
  const size = /^small/.test(unit) ? 0.6 : /^large/.test(unit) ? 1.4 : 1;
  return v * (food.each || 100) * size;
}
export const foodOf = item => FOODS.find(f => f.re.test(item)) || null;
// Per serving: { kcal, protein, carbs }, rounded.
// lookup(item, food) can return { kcal, p, c } per 100 g from a real product label (a barcode you scanned);
// the table still says how much a cup or a can of it weighs.
export function nutrition(ingredients, serves, lookup) {
  let kcal = 0, p = 0, c = 0, labels = 0;
  for (const i of ingredients || []) {
    const item = typeof i === "string" ? i : i.item, food = item && foodOf(item);
    if (!food) continue;
    const real = lookup ? lookup(item, food) : null, v = real || food;
    if (!v.kcal) continue;
    const g = grams(typeof i === "string" ? "" : i.amount, food) / 100;
    if (!g) continue;
    if (real) labels++;
    kcal += g * v.kcal; p += g * v.p; c += g * v.c;
  }
  const n = Math.max(1, serves || 4);
  return { kcal: Math.round(kcal / n / 10) * 10, protein: Math.round(p / n), carbs: Math.round(c / n), labels };
}
// Sorting into the Healthy & diet tiles. Thresholds are per serving.
export const HEALTH = {
  hiprotein: n => n.protein >= 35 && n.protein * 4 >= n.kcal * 0.25,   // muscle building: lots of protein for the calories
  light: n => n.kcal > 0 && n.kcal <= 550,                              // weight loss
  lowcarb: n => n.kcal > 0 && n.carbs <= 25
};

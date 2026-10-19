// Versions of a built-in meal: same dish, different protein or cooking method. One tile, a row of buttons on the recipe.
// Each version only lists what changes from the base recipe, and every changed step is written out by hand
// so cooking times and safe temperatures stay right (no AI, no guessing).
//   e / label: the button for the base recipe
//   v: the other versions
//     k: short id · e / label: its button · name: what the recipe is called
//     swap: { "Base ingredient": ["New ingredient", "amount"] }, or null to leave it out
//     add: [["Ingredient", "amount"]] added at the end
//     steps: { index: "new text" } (index from 0, null removes that step), or a full array to replace them all
//     ingredients: a full list instead of swap/add (for a different method, like slow cooker)
//     minutes, waitMinutes, waitNote, summary: when they differ
const CHICKEN = ["Boneless chicken thighs", "1 1/4 lb"];
const SHRIMP = ["Shrimp, peeled", "1 1/2 lb"];
const TOFU = ["Extra-firm tofu", "14 oz"];

export const MEAL_VERSIONS = {
  /* ---------- Mexican & Tex-Mex ---------- */
  "Beef Tacos": { e: "🐄", label: "Beef", v: [
    { k: "chicken", e: "🐔", label: "Chicken", name: "Chicken Tacos", swap: { "Ground beef": CHICKEN },
      steps: { 0: "Dice the onion and tomatoes, shred the lettuce and cut the chicken into small bite-size pieces.",
        2: "Add the chicken and cook for 7 to 8 minutes, stirring, until browned and cooked through (165°F).",
        5: "Fill the shells with chicken and top with lettuce, tomato, cheese, sour cream and salsa." } },
    { k: "beans", e: "🫘", label: "Beans", name: "Black Bean Tacos", minutes: 20, swap: { "Ground beef": ["Black beans", "2 cans (15 oz)"] },
      steps: { 2: "Add the drained beans and cook for 3 minutes, mashing about a third of them.", 3: "Stir in the taco seasoning and 1/3 cup water. Simmer for 3 minutes until thick.",
        5: "Fill the shells with beans and top with lettuce, tomato, cheese, sour cream and salsa." } }] },
  "Beef Burrito Bowls": { e: "🐄", label: "Beef", v: [
    { k: "chicken", e: "🐔", label: "Chicken", name: "Chicken Burrito Bowls", swap: { "Ground beef": CHICKEN },
      steps: { 1: "Cut the chicken into bite-size pieces and cook in a hot oiled skillet for 7 minutes until cooked through (165°F). Add the seasoning and 1/2 cup water and simmer for 3 minutes.",
        3: "Build bowls with rice, chicken, beans, corn, lettuce, tomato, avocado, cheese, sour cream and salsa." } },
    { k: "shrimp", e: "🦐", label: "Shrimp", name: "Shrimp Burrito Bowls", swap: { "Ground beef": SHRIMP }, add: [["Olive oil", "1 tbsp"]],
      steps: { 1: "Toss the shrimp with the taco seasoning and oil and cook in a hot skillet for 2 minutes per side until pink.",
        3: "Build bowls with rice, shrimp, beans, corn, lettuce, tomato, avocado, cheese, sour cream and salsa." } }] },
  "Chicken Enchiladas": { e: "🐔", label: "Chicken", v: [
    { k: "beef", e: "🐄", label: "Beef", name: "Beef Enchiladas", swap: { "Cooked chicken": ["Ground beef", "1 1/2 lb"] },
      steps: { 0: "Heat the oven to 375°F. Brown the beef with the chopped onion in the oil for 8 minutes and drain the fat.",
        1: "Mix the beef and onion with the cumin, salt, 1/2 cup sauce and 1 cup cheese." } },
    { k: "beans", e: "🫘", label: "Bean & cheese", name: "Bean & Cheese Enchiladas", swap: { "Cooked chicken": ["Pinto or black beans", "2 cans (15 oz)"] },
      steps: { 1: "Mix the onion with the drained beans, cumin, salt, 1/2 cup sauce and 1 cup cheese, mashing some of the beans." } }] },
  "Chicken Fajitas": { e: "🐔", label: "Chicken", v: [
    { k: "steak", e: "🥩", label: "Steak", name: "Steak Fajitas", swap: { "Boneless chicken breasts": ["Flank or skirt steak", "1 1/2 lb"] },
      steps: { 0: "Slice the peppers and onion into strips.", 1: "Rub the whole steak with half the oil, the spices, salt and lime juice. Let it sit for 10 minutes.",
        2: "Sear the steak in a very hot skillet for 4 to 5 minutes per side for medium. Rest 5 minutes, then slice thin across the grain.",
        4: "Warm the tortillas and serve with the steak, peppers, sour cream, salsa and cheese." } },
    { k: "shrimp", e: "🦐", label: "Shrimp", name: "Shrimp Fajitas", minutes: 25, swap: { "Boneless chicken breasts": SHRIMP },
      steps: { 0: "Slice the peppers and onion into strips.", 1: "Toss the shrimp with half the oil, the spices, salt and lime juice.",
        2: "Cook the shrimp in a hot skillet for 2 minutes per side until pink. Set aside.", 4: "Warm the tortillas and serve with the shrimp, peppers, sour cream, salsa and cheese." } }] },
  "Black Bean Quesadillas": { e: "🫘", label: "Beans", v: [
    { k: "chicken", e: "🐔", label: "Chicken", name: "Chicken Quesadillas", swap: { "Black beans": ["Rotisserie chicken", "2 cups shredded"] },
      steps: { 0: "Toss the shredded chicken with the cumin and chili powder, then stir in the corn.",
        2: "Fill half of each tortilla with chicken, pepper, green onions and cheese, and fold." } }] },
  "Sheet Pan Chicken Nachos": { e: "🐔", label: "Chicken", v: [
    { k: "beef", e: "🐄", label: "Beef", name: "Sheet Pan Beef Nachos", swap: { "Rotisserie chicken": ["Ground beef", "1 lb"] },
      steps: { 1: "Brown the beef for 7 minutes and drain, then stir in the taco seasoning and 2 tbsp water.",
        2: "Spread half the chips on the pan and top with half the beef, beans and cheese. Repeat the layers." } }] },

  /* ---------- Stir-fries, noodles & fried rice ---------- */
  "Chicken Stir-Fry": { e: "🐔", label: "Chicken", v: [
    { k: "beef", e: "🐄", label: "Beef", name: "Beef Stir-Fry", swap: { "Boneless chicken breasts": ["Flank or sirloin steak", "1 1/2 lb"] },
      steps: { 2: "Slice the steak thin across the grain and stir-fry in hot oil in two batches, 2 to 3 minutes each, until browned. Set aside.",
        4: "Add the garlic and ginger for 30 seconds, then the beef and sauce. Cook for 2 minutes until glossy." } },
    { k: "shrimp", e: "🦐", label: "Shrimp", name: "Shrimp Stir-Fry", swap: { "Boneless chicken breasts": SHRIMP },
      steps: { 2: "Stir-fry the shrimp in hot oil for 3 minutes until pink. Set aside.", 4: "Add the garlic and ginger for 30 seconds, then the shrimp and sauce. Cook for 2 minutes until glossy." } },
    { k: "tofu", e: "🧈", label: "Tofu", name: "Tofu Stir-Fry", minutes: 35, swap: { "Boneless chicken breasts": TOFU },
      steps: { 2: "Press the tofu dry with paper towels, cut into cubes and fry in the hot oil for 8 minutes, turning, until golden. Set aside.",
        4: "Add the garlic and ginger for 30 seconds, then the tofu and sauce. Cook for 2 minutes until glossy." } }] },
  "Beef & Broccoli": { e: "🐄", label: "Beef", v: [
    { k: "chicken", e: "🐔", label: "Chicken", name: "Chicken & Broccoli", swap: { "Flank steak": ["Boneless chicken breasts", "1 1/2 lb"], "Beef broth": ["Chicken broth", "1/2 cup"] },
      steps: { 1: "Slice the chicken thin and toss with 1 tbsp cornstarch.", 3: "Cook the chicken in hot oil in batches, 4 to 5 minutes per batch, until cooked through. Set aside.",
        5: "Add the garlic and ginger for 30 seconds, then the chicken and sauce. Simmer for 2 minutes until glossy." } },
    { k: "shrimp", e: "🦐", label: "Shrimp", name: "Shrimp & Broccoli", swap: { "Flank steak": SHRIMP, "Beef broth": ["Chicken broth", "1/2 cup"] },
      steps: { 1: "Pat the shrimp dry and toss with 1 tbsp cornstarch.", 3: "Cook the shrimp in hot oil for 2 minutes per side until pink. Set aside.",
        5: "Add the garlic and ginger for 30 seconds, then the shrimp and sauce. Simmer for 1 minute until glossy." } }] },
  "Vegetable Fried Rice": { e: "🥕", label: "Veggie", v: [
    { k: "chicken", e: "🐔", label: "Chicken", name: "Chicken Fried Rice", add: [["Boneless chicken breasts", "3/4 lb"]],
      steps: { 1: "Cook the diced chicken in a little oil for 5 minutes until cooked through and set aside. Then scramble the eggs for 1 minute and set aside.",
        4: "Stir in the soy sauce, sesame oil, chicken, eggs and green onions." } },
    { k: "shrimp", e: "🦐", label: "Shrimp", name: "Shrimp Fried Rice", add: [["Shrimp, peeled", "3/4 lb"]],
      steps: { 1: "Cook the shrimp in a little oil for 3 minutes until pink and set aside. Then scramble the eggs for 1 minute and set aside.",
        4: "Stir in the soy sauce, sesame oil, shrimp, eggs and green onions." } }] },
  "Chicken Lo Mein": { e: "🐔", label: "Chicken", v: [
    { k: "beef", e: "🐄", label: "Beef", name: "Beef Lo Mein", swap: { "Boneless chicken breasts": ["Flank or sirloin steak", "1 lb"] },
      steps: { 1: "Stir-fry the thinly sliced steak in the oil for 2 to 3 minutes until browned. Set aside.",
        3: "Add the noodles, beef, soy sauce, oyster sauce, sesame oil and sugar and toss for 2 minutes. Top with green onions." } },
    { k: "shrimp", e: "🦐", label: "Shrimp", name: "Shrimp Lo Mein", swap: { "Boneless chicken breasts": ["Shrimp, peeled", "1 lb"] },
      steps: { 1: "Stir-fry the shrimp in the oil for 3 minutes until pink. Set aside.",
        3: "Add the noodles, shrimp, soy sauce, oyster sauce, sesame oil and sugar and toss for 2 minutes. Top with green onions." } },
    { k: "veggie", e: "🥕", label: "Veggie", name: "Vegetable Lo Mein", swap: { "Boneless chicken breasts": ["Mushrooms", "8 oz"] }, add: [["Snow peas", "2 cups"]],
      steps: { 1: "Stir-fry the sliced mushrooms in the oil for 4 minutes until browned.", 2: "Add the carrots, cabbage and snow peas for 3 minutes, then the garlic for 30 seconds." } }] },
  "Teriyaki Chicken": { e: "🐔", label: "Chicken", v: [
    { k: "salmon", e: "🐟", label: "Salmon", name: "Teriyaki Salmon", minutes: 30, swap: { "Boneless chicken thighs": ["Salmon fillets", "4 (6 oz each)"] },
      steps: { 2: "Cook the salmon in the oil, flesh side down, for 4 minutes, then flip and cook for 3 minutes more.",
        4: "Pour the sauce around the salmon and simmer for 2 minutes, spooning it over, until thick. Top with sesame seeds." } },
    { k: "tofu", e: "🧈", label: "Tofu", name: "Teriyaki Tofu", swap: { "Boneless chicken thighs": ["Extra-firm tofu", "2 blocks (14 oz)"] },
      steps: { 2: "Press the tofu dry, cut it into slabs and fry in the oil for 4 minutes per side until golden.",
        4: "Pour the sauce over the tofu and simmer for 2 minutes until thick and glazed. Top with sesame seeds." } }] },
  "Kung Pao Chicken": { e: "🐔", label: "Chicken", v: [
    { k: "shrimp", e: "🦐", label: "Shrimp", name: "Kung Pao Shrimp", swap: { "Boneless chicken thighs": SHRIMP },
      steps: { 0: "Start the rice. Pat the shrimp dry and toss with 1 tbsp cornstarch and 1 tbsp soy sauce.",
        2: "Heat the oil in a wok over high heat and fry the chilies for 30 seconds. Add the shrimp and cook for 2 to 3 minutes until pink." } },
    { k: "tofu", e: "🧈", label: "Tofu", name: "Kung Pao Tofu", swap: { "Boneless chicken thighs": TOFU },
      steps: { 0: "Start the rice. Press the tofu dry, cut into cubes and toss with 1 tbsp cornstarch and 1 tbsp soy sauce.",
        2: "Heat the oil in a wok over high heat and fry the chilies for 30 seconds. Add the tofu and fry for 6 minutes until golden." } }] },
  "General Tso's Chicken": { e: "🐔", label: "Chicken", v: [
    { k: "tofu", e: "🧈", label: "Tofu", name: "General Tso's Tofu", swap: { "Boneless chicken thighs": ["Extra-firm tofu", "2 blocks (14 oz)"], "Egg": null, "Chicken broth": ["Vegetable broth", "1/2 cup"] },
      steps: { 1: "Press the tofu dry, cut it into bites and toss with all but 1 tbsp of the cornstarch.", 5: "Toss in the tofu and top with green onions." } }] },
  "Sweet & Sour Pork": { e: "🐷", label: "Pork", v: [
    { k: "chicken", e: "🐔", label: "Chicken", name: "Sweet & Sour Chicken", swap: { "Pork loin": ["Boneless chicken breasts", "1 1/2 lb"] },
      steps: { 1: "Toss the chicken cubes with the egg, then all but 1 tbsp of the cornstarch. Fry in batches for 5 to 6 minutes until golden and cooked through.",
        4: "Add the sauce and simmer for 2 minutes until thick. Toss in the chicken." } }] },

  /* ---------- Thai, Korean & Indian ---------- */
  "Pad Thai": { e: "🦐", label: "Shrimp", v: [
    { k: "chicken", e: "🐔", label: "Chicken", name: "Chicken Pad Thai", swap: { "Shrimp": ["Boneless chicken thighs", "1 lb"] },
      steps: { 2: "Cook the thinly sliced chicken in hot oil for 5 minutes until cooked through. Set aside.", 5: "Add the chicken, sprouts and green onions for 1 minute. Top with chopped peanuts and lime wedges." } },
    { k: "tofu", e: "🧈", label: "Tofu", name: "Tofu Pad Thai", swap: { "Shrimp": TOFU },
      steps: { 2: "Fry the cubed tofu in hot oil for 8 minutes until golden. Set aside.", 5: "Add the tofu, sprouts and green onions for 1 minute. Top with chopped peanuts and lime wedges." } }] },
  "Thai Red Curry Chicken": { e: "🐔", label: "Chicken", v: [
    { k: "shrimp", e: "🦐", label: "Shrimp", name: "Thai Red Curry Shrimp", swap: { "Boneless chicken breasts": SHRIMP },
      steps: { 3: "Add the pepper and green beans and simmer for 5 minutes.", 4: "Add the shrimp and simmer for 3 minutes until pink." } },
    { k: "tofu", e: "🧈", label: "Tofu", name: "Thai Red Curry with Tofu", swap: { "Boneless chicken breasts": TOFU },
      steps: { 3: "Add the cubed tofu and simmer for 5 minutes." } }] },
  "Thai Green Curry": { e: "🐔", label: "Chicken", v: [
    { k: "shrimp", e: "🦐", label: "Shrimp", name: "Thai Green Curry Shrimp", swap: { "Boneless chicken thighs": SHRIMP },
      steps: { 0: "Start the rice and trim the beans.", 2: "Stir in half a can of coconut milk and cook for 2 minutes.",
        3: "Add the rest of the coconut milk, broth, fish sauce, sugar, beans and sliced pepper. Simmer for 8 minutes, then add the shrimp for 3 minutes until pink." } },
    { k: "tofu", e: "🧈", label: "Tofu", name: "Thai Green Curry with Tofu", swap: { "Boneless chicken thighs": TOFU, "Chicken broth": ["Vegetable broth", "1/2 cup"] },
      steps: { 0: "Start the rice. Press the tofu dry, cut it into cubes and trim the beans.", 2: "Stir in half a can of coconut milk and cook for 2 minutes. Add the tofu." } }] },
  "Thai Basil Chicken": { e: "🐔", label: "Chicken", v: [
    { k: "pork", e: "🐷", label: "Pork", name: "Thai Basil Pork", swap: { "Ground chicken": ["Ground pork", "1 1/2 lb"] },
      steps: { 3: "Add the pork and cook for 6 minutes, breaking it up, until no longer pink." } },
    { k: "beef", e: "🐄", label: "Beef", name: "Thai Basil Beef", swap: { "Ground chicken": ["Ground beef", "1 1/2 lb"] },
      steps: { 3: "Add the beef and cook for 5 minutes, breaking it up, until browned." } }] },
  "Drunken Noodles (Pad Kee Mao)": { e: "🐔", label: "Chicken", v: [
    { k: "shrimp", e: "🦐", label: "Shrimp", name: "Shrimp Drunken Noodles", swap: { "Boneless chicken thighs": ["Shrimp, peeled", "1 lb"] },
      steps: { 2: "Heat the oil in a wok over high heat. Stir-fry the garlic and chilies for 30 seconds, then the shrimp for 3 minutes until pink." } },
    { k: "beef", e: "🐄", label: "Beef", name: "Beef Drunken Noodles", swap: { "Boneless chicken thighs": ["Flank steak", "1 lb"] },
      steps: { 2: "Heat the oil in a wok over high heat. Stir-fry the garlic and chilies for 30 seconds, then the thinly sliced steak for 2 to 3 minutes." } }] },
  "Bibimbap": { e: "🐄", label: "Beef", v: [
    { k: "chicken", e: "🐔", label: "Chicken", name: "Chicken Bibimbap", swap: { "Ground beef": ["Boneless chicken thighs", "1 lb"] },
      steps: { 1: "Cook the thinly sliced chicken for 6 minutes until cooked through, then stir in 2 tbsp soy sauce, the brown sugar, 2 minced garlic cloves and 1 tsp sesame oil.",
        5: "Fill bowls with rice, arrange the chicken and vegetables on top, add an egg and drizzle with sauce. Stir it all together to eat." } },
    { k: "tofu", e: "🧈", label: "Tofu", name: "Tofu Bibimbap", swap: { "Ground beef": TOFU },
      steps: { 1: "Fry the cubed tofu in a little oil for 8 minutes until golden, then stir in 2 tbsp soy sauce, the brown sugar, 2 minced garlic cloves and 1 tsp sesame oil.",
        5: "Fill bowls with rice, arrange the tofu and vegetables on top, add an egg and drizzle with sauce. Stir it all together to eat." } }] },
  "Chicken Tikka Masala": { e: "🐔", label: "Chicken", v: [
    { k: "shrimp", e: "🦐", label: "Shrimp", name: "Shrimp Tikka Masala", waitMinutes: 15, waitNote: "Marinate 15 minutes", swap: { "Boneless chicken breasts": ["Shrimp, peeled", "2 lb"] },
      steps: { 0: "Marinate the shrimp in the yogurt, lemon juice, 1 tsp garam masala, 1 tsp cumin, 1 tsp paprika and 1 tsp salt for 15 minutes.",
        1: "Spread the shrimp on a foil-lined sheet pan and broil for 4 minutes until pink and charred at the edges.", 4: "Add the cream and shrimp and simmer for 2 minutes. Top with cilantro and serve with rice." } },
    { k: "chickpea", e: "🫘", label: "Chickpea", name: "Chickpea Tikka Masala", minutes: 40, waitMinutes: 0, waitNote: "",
      swap: { "Boneless chicken breasts": ["Canned chickpeas", "2 cans (15 oz)"], "Plain yogurt": null },
      steps: ["Start the rice. Drain and rinse the chickpeas.", "Heat the oil in a large pan and cook the diced onion for 7 minutes, then the garlic and ginger for 1 minute.",
        "Stir in the garam masala, cumin and paprika for 30 seconds, add the tomatoes and 2 tsp salt and simmer for 15 minutes.",
        "Add the chickpeas and cream and simmer for 10 minutes. Squeeze in the lemon, top with cilantro and serve with rice."] }] },
  "Butter Chicken": { e: "🐔", label: "Chicken", v: [
    { k: "paneer", e: "🧀", label: "Paneer", name: "Butter Paneer (Paneer Makhani)", minutes: 35, waitMinutes: 0, waitNote: "",
      swap: { "Boneless chicken thighs": ["Paneer", "1 1/2 lb"], "Plain yogurt": null },
      steps: ["Start the rice. Cut the paneer into cubes.", "Melt 2 tbsp butter in a large skillet and brown the paneer for 5 minutes, turning. Set aside.",
        "Melt the rest of the butter and cook the diced onion for 6 minutes. Add the garlic and ginger for 1 minute.",
        "Add the tomato sauce, garam masala, cumin, chili powder, turmeric, salt and sugar. Simmer for 10 minutes.",
        "Stir in the cream and the paneer and simmer for 5 minutes. Serve with rice and warm naan."] }] },
  "Vegetable Korma": { e: "🥕", label: "Veggie", v: [
    { k: "chicken", e: "🐔", label: "Chicken", name: "Chicken Korma", minutes: 45, swap: { "Cauliflower": ["Boneless chicken thighs", "1 1/2 lb"] },
      steps: { 1: "Start the rice. Melt the butter and brown the bite-size chicken pieces for 5 minutes. Add the diced onion for 6 minutes, then the garlic and ginger for 1 minute.",
        2: "Add the spices for 30 seconds, then the potatoes, carrots, beans, salt and 1 cup water. Cover and simmer for 15 minutes until the chicken is cooked through." } }] },

  /* ---------- Pasta, Greek, sandwiches & salads ---------- */
  "Chicken Alfredo": { e: "🐔", label: "Chicken", v: [
    { k: "shrimp", e: "🦐", label: "Shrimp", name: "Shrimp Alfredo", swap: { "Boneless chicken breasts": SHRIMP },
      steps: { 1: "Season and cook the shrimp in the oil for 2 minutes per side until pink.", 4: "Toss with the pasta and shrimp and top with parsley." } },
    { k: "plain", e: "🧀", label: "No meat", name: "Fettuccine Alfredo", minutes: 20, swap: { "Boneless chicken breasts": null, "Olive oil": null },
      steps: { 1: null, 4: "Toss with the pasta and top with parsley." } }] },
  "Pesto Pasta with Chicken": { e: "🐔", label: "Chicken", v: [
    { k: "shrimp", e: "🦐", label: "Shrimp", name: "Pesto Pasta with Shrimp", swap: { "Boneless chicken breasts": ["Shrimp, peeled", "1 lb"] },
      steps: { 1: "Season the shrimp with the Italian seasoning and salt and cook in the oil for 2 minutes per side until pink.", 4: "Fold in the shrimp, tomatoes and Parmesan." } },
    { k: "plain", e: "🌿", label: "No meat", name: "Pesto Pasta", minutes: 20, swap: { "Boneless chicken breasts": null, "Italian seasoning": null, "Olive oil": null },
      steps: { 1: null, 4: "Fold in the tomatoes and Parmesan." } }] },
  "Shrimp Scampi": { e: "🦐", label: "Shrimp", v: [
    { k: "chicken", e: "🐔", label: "Chicken", name: "Chicken Scampi", swap: { "Shrimp": ["Boneless chicken breasts", "1 1/2 lb"] },
      steps: { 1: "Cook the bite-size chicken pieces in the butter and oil for 6 to 7 minutes until cooked through (165°F), then add the garlic for 1 minute.", 2: null } }] },
  "Spaghetti & Meatballs": { e: "🐄", label: "Beef", v: [
    { k: "turkey", e: "🦃", label: "Turkey", name: "Spaghetti & Turkey Meatballs", swap: { "Ground beef": ["Ground turkey", "1 lb"] },
      steps: { 0: "Mix the turkey, breadcrumbs, egg, half the Parmesan, minced garlic, milk, seasoning, salt and pepper. Roll into 1 1/2 inch balls with damp hands.",
        2: "Pour in the sauce, cover and simmer for 20 minutes until the meatballs reach 165°F in the center." } }] },
  "Greek Chicken Souvlaki": { e: "🐔", label: "Chicken", v: [
    { k: "pork", e: "🐷", label: "Pork", name: "Pork Souvlaki", swap: { "Boneless chicken thighs": ["Pork shoulder or loin", "2 lb"] },
      steps: { 0: "Cut the pork into 1 1/2 inch pieces. Marinate with the oil, juice of 1 lemon, 3 garlic cloves, oregano, salt and pepper for 1 hour.",
        2: "Thread the pork onto skewers (soak wooden ones first).", 3: "Grill or broil for 10 to 12 minutes, turning, until browned and 145°F inside." } },
    { k: "shrimp", e: "🦐", label: "Shrimp", name: "Shrimp Souvlaki", waitMinutes: 20, waitNote: "Marinate 20 minutes", swap: { "Boneless chicken thighs": SHRIMP },
      steps: { 0: "Marinate the shrimp with the oil, juice of 1 lemon, 3 garlic cloves, oregano, salt and pepper for 20 minutes (no longer, or the lemon turns them mushy).",
        2: "Thread the shrimp onto skewers (soak wooden ones first).", 3: "Grill or broil for 2 to 3 minutes per side until pink." } }] },
  "Philly Cheesesteaks": { e: "🥩", label: "Steak", v: [
    { k: "chicken", e: "🐔", label: "Chicken", name: "Chicken Cheesesteaks", swap: { "Ribeye or sirloin steak": ["Boneless chicken thighs", "1 1/2 lb"] },
      steps: { 0: "Slice the chicken as thin as you can (15 minutes in the freezer makes it easier).",
        2: "Heat the rest of the oil over high heat and cook the chicken for 6 minutes, chopping it with the spatula, until cooked through. Season with salt and pepper." } }] },
  "Chicken Caesar Salad": { e: "🐔", label: "Chicken", v: [
    { k: "shrimp", e: "🦐", label: "Shrimp", name: "Shrimp Caesar Salad", swap: { "Boneless chicken breasts": SHRIMP },
      steps: { 0: "Season the shrimp with the Italian seasoning and salt and cook in the oil for 2 minutes per side until pink.", 3: "Top with the shrimp, croutons and Parmesan." } },
    { k: "steak", e: "🥩", label: "Steak", name: "Steak Caesar Salad", swap: { "Boneless chicken breasts": ["Sirloin steak", "1 1/2 lb"] },
      steps: { 0: "Season the steak with the Italian seasoning and salt and sear in the oil for 4 to 5 minutes per side for medium. Rest 5 minutes and slice thin.", 3: "Top with the steak, croutons and Parmesan." } }] },
  "Burgers": { e: "🐄", label: "Beef", v: [
    { k: "turkey", e: "🦃", label: "Turkey", name: "Turkey Burgers", swap: { "Ground beef 80/20": ["Ground turkey", "1 1/2 lb"] }, add: [["Olive oil", "1 tbsp"]],
      steps: { 0: "Shape the turkey into 4 patties with damp hands and press a dimple in the middle of each.",
        2: "Cook on an oiled grill or skillet over medium heat for 5 to 6 minutes per side, adding the cheese at the end, until 165°F in the center." } },
    { k: "bean", e: "🫘", label: "Black bean", name: "Black Bean Burgers", swap: { "Ground beef 80/20": ["Black beans", "2 cans (15 oz)"] },
      add: [["Breadcrumbs", "1/2 cup"], ["Egg", "1"], ["Cumin", "1 tsp"], ["Vegetable oil", "2 tbsp"]],
      steps: { 0: "Pat the drained beans dry and mash them with the breadcrumbs, egg and cumin. Shape into 4 patties and chill for 15 minutes if they're soft.",
        2: "Cook in the oil in a skillet over medium heat for 4 to 5 minutes per side until crisp, adding the cheese at the end." } }] },

  /* ---------- Cooking method ---------- */
  "Pot Roast": { e: "🔥", label: "Oven", v: [
    { k: "slow", e: "🐢", label: "Slow cooker", name: "Slow Cooker Pot Roast", minutes: 490, summary: "Set-it-and-forget-it chuck roast with potatoes and carrots in onion gravy.",
      ingredients: [["Beef chuck roast", "3 lb"], ["Salt", "2 tsp"], ["Black pepper", "1 tsp"], ["Olive oil", "1 tbsp"], ["Onion", "1"], ["Carrots", "1 lb"], ["Yukon Gold potatoes", "2 lb"],
        ["Garlic", "4 cloves"], ["Beef broth", "1 1/2 cups"], ["Onion soup mix", "1 packet"], ["Worcestershire sauce", "1 tbsp"], ["Thyme", "1 tsp dried"], ["Cornstarch", "2 tbsp"]],
      steps: ["Season the roast and sear it in the oil for 4 minutes per side (you can skip this if rushed).",
        "Put the potatoes and carrots in chunks and the onion in wedges in the slow cooker, with the roast on top.",
        "Mix the broth, soup mix, Worcestershire, garlic and thyme and pour over.", "Cook on low for 8 hours until fork-tender.",
        "Pour the liquid into a pot, whisk in the cornstarch mixed with 1/4 cup water and simmer for 2 minutes for gravy."] }] },
  "Chili": { e: "🐄", label: "Beef", v: [
    { k: "veggie", e: "🫘", label: "Veggie", name: "Three-Bean Veggie Chili", minutes: 45, swap: { "Ground beef": ["Black beans", "1 can"], "Beef broth": ["Vegetable broth", "1 cup"] },
      add: [["Pinto beans", "1 can"], ["Corn", "1 cup"], ["Olive oil", "2 tbsp"]],
      steps: { 0: "Heat the oil in a large pot over medium heat.", 3: "Add the tomatoes, all the drained beans, the corn and broth. Simmer for 25 minutes, stirring now and then." } }] }
};

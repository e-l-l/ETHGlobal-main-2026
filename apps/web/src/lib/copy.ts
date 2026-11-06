/**
 * Merchant onboarding and customer pay copy, EN and rioplatense ES (vos).
 * Voice rules: anay-design.md section 10 and anay-docs/ux.md "Words to use and avoid".
 * Short sentences that translate cleanly. No loan, interest, APR, gas, wallet or proof words.
 */

export type Lang = "en" | "es";

export function langFrom(value: string | undefined): Lang {
  return value === "es" ? "es" : "en";
}

const en = {
  welcome: {
    eyebrow: "For shops in Buenos Aires",
    title: "Dollars for stock, today.",
    body: "Every sale puts 10% in your dollar jar. Your jar and your record unlock stock on credit.",
    promise1: "We never ask for your name, phone or contacts.",
    promise2: "Your agent only draws inside limits you set.",
    promise3: "A slow week slows repayment. No extra fee.",
    cta: "Prove your business",
    back: "Back",
  },
  steps: (at: number) => `Step ${at} of 3`,
  prove: {
    title: "Prove your shop is real",
    body: "Log in to your seller portal on this phone. We check four facts and learn nothing else.",
    weCheck: "We check",
    facts: ["Country", "Revenue band, not the number", "Selling 6 months or more", "Account in good standing"],
    neverSee: "We never see your name, your customers or your sales.",
    time: "About 30 seconds. The check runs on this phone.",
    cta: "Log in to seller portal",
    demoShop: "Use the demo shop",
    showFail: "Show a failed check",
    failTitle: "Pick an outcome",
    failBody: "Each one is a seeded portal account.",
    world: "Nothing is onchain yet.",
  },
  verifying: {
    title: "Checking your record privately",
    body: "Nobody can see the numbers while we check.",
    steps: ["Reading the seller portal", "Checking the four facts on this phone", "Saving your Business Pass"],
    cancel: "Cancel",
    world: "The portal data stays on this phone. Only the result will be saved.",
  },
  pass: {
    title: "You're verified",
    body: "Your Business Pass lives on this phone.",
    facts: [
      { k: "Country", v: "Argentina" },
      { k: "Revenue band", v: "Band 2" },
      { k: "Selling for", v: "6+ months" },
    ],
    learned: "We learned nothing else.",
    next: "Your first limit starts small. It grows each time you repay.",
    cta: "Create your shop",
    world: "Only a commitment is onchain. The pass details stay here.",
  },
  failed: {
    "too-new": {
      tag: "Too new",
      title: "Your shop is too new",
      body: "We need 6 months of sales in the portal.",
      next: "Keep selling and come back. Nothing about this check was saved.",
    },
    suspended: {
      tag: "Suspended",
      title: "This seller account is suspended",
      body: "The portal says the account is suspended.",
      next: "Clear it with the portal, then try again. We did not keep your login.",
    },
    "revenue-low": {
      tag: "Revenue too low",
      title: "Sales are under the first band",
      body: "Band 1 starts around $500 a month. We only learned the account is under it, not the number.",
      next: "Try again when monthly sales grow. Nothing was saved.",
    },
    generic: {
      tag: "Not verified",
      title: "We couldn't verify this account",
      body: "The portal didn't return the four facts.",
      next: "Try again, or use another account.",
    },
    retry: "Try another account",
    start: "Back to start",
    world: "Nothing was written onchain.",
  },
  shop: {
    title: "Name your shop",
    body: "Customers see this name and the QR. Never an advance, a fee or a balance.",
    label: "Shop name",
    hint: "Keep it ordinary. Not your own name.",
    ideas: "Ideas",
    qr: "Payment QR",
    cta: "Set up your agent",
    preview: "Preview the pay screen",
    world: "The shop name and QR address are public. Your Business Pass is not linked to them.",
    empty: "Add a name to continue",
  },
};

const es: typeof en = {
  welcome: {
    eyebrow: "Para kioscos de Buenos Aires",
    title: "Dólares para el stock, hoy.",
    body: "Cada venta pone el 10% en tu alcancía de dólares. Tu alcancía y tu historial te dan stock a crédito.",
    promise1: "Nunca te pedimos el nombre, el teléfono ni los contactos.",
    promise2: "Tu agente solo retira dentro de los límites que vos ponés.",
    promise3: "Una semana floja frena el pago. Sin recargo.",
    cta: "Probá tu negocio",
    back: "Volver",
  },
  steps: (at: number) => `Paso ${at} de 3`,
  prove: {
    title: "Demostrá que tu kiosco es real",
    body: "Entrá a tu portal de ventas en este teléfono. Chequeamos cuatro datos y nada más.",
    weCheck: "Chequeamos",
    facts: ["País", "Banda de ventas, no el número", "6 meses o más vendiendo", "Cuenta sin suspensiones"],
    neverSee: "Nunca vemos tu nombre, tus clientes ni tus ventas.",
    time: "Unos 30 segundos. El chequeo corre en este teléfono.",
    cta: "Entrar al portal de ventas",
    demoShop: "Usar el kiosco de prueba",
    showFail: "Ver un chequeo rechazado",
    failTitle: "Elegí un resultado",
    failBody: "Cada uno es una cuenta de prueba del portal.",
    world: "Todavía no hay nada en la cadena.",
  },
  verifying: {
    title: "Chequeando tu historial en privado",
    body: "Nadie puede ver los números mientras chequeamos.",
    steps: ["Leyendo el portal de ventas", "Chequeando los cuatro datos en este teléfono", "Guardando tu Pase de Negocio"],
    cancel: "Cancelar",
    world: "Los datos del portal quedan en este teléfono. Solo se guarda el resultado.",
  },
  pass: {
    title: "Estás verificado",
    body: "Tu Pase de Negocio vive en este teléfono.",
    facts: [
      { k: "País", v: "Argentina" },
      { k: "Banda de ventas", v: "Banda 2" },
      { k: "Vendiendo hace", v: "6+ meses" },
    ],
    learned: "No supimos nada más.",
    next: "Tu primer límite es chico. Crece cada vez que pagás.",
    cta: "Creá tu kiosco",
    world: "En la cadena solo hay un compromiso. Los datos del pase quedan acá.",
  },
  failed: {
    "too-new": {
      tag: "Muy nuevo",
      title: "Tu kiosco es muy nuevo",
      body: "Hacen falta 6 meses de ventas en el portal.",
      next: "Seguí vendiendo y volvé. No guardamos nada de este chequeo.",
    },
    suspended: {
      tag: "Suspendida",
      title: "Esta cuenta está suspendida",
      body: "El portal dice que la cuenta está suspendida.",
      next: "Resolvelo con el portal y probá de nuevo. No guardamos tu ingreso.",
    },
    "revenue-low": {
      tag: "Ventas bajas",
      title: "Las ventas están bajo la primera banda",
      body: "La banda 1 arranca cerca de 500 dólares al mes. Solo supimos que la cuenta está debajo, no el número.",
      next: "Probá de nuevo cuando crezcan las ventas. No guardamos nada.",
    },
    generic: {
      tag: "Sin verificar",
      title: "No pudimos verificar esta cuenta",
      body: "El portal no devolvió los cuatro datos.",
      next: "Probá de nuevo, o usá otra cuenta.",
    },
    retry: "Probar otra cuenta",
    start: "Volver al inicio",
    world: "No se escribió nada en la cadena.",
  },
  shop: {
    title: "Ponele nombre a tu kiosco",
    body: "Quien paga ve este nombre y el QR. Nunca un adelanto, una comisión ni un saldo.",
    label: "Nombre del kiosco",
    hint: "Que sea común. No uses tu nombre.",
    ideas: "Ideas",
    qr: "QR de cobro",
    cta: "Configurá tu agente",
    preview: "Ver la pantalla de pago",
    world: "El nombre y la dirección del QR son públicos. Tu Pase de Negocio no está ligado a ellos.",
    empty: "Poné un nombre para seguir",
  },
};

export const copy: Record<Lang, typeof en> = { en, es };

/* Customer pay. The payer never sees an advance, a fee or a balance. */
const payEn = {
  verified: "Pay in dollars",
  youPay: "You pay with",
  swap: (tok: string) => (tok === "USDC" ? "Arrives as dollars. Network fee covered." : `${tok} swaps to dollars through Uniswap. Network fee covered.`),
  pay: (amt: string) => `Pay ${amt}`,
  enter: "Enter an amount",
  paying: "Paying",
  funding: "Getting your test dollars…",
  testUsdc: "Testnet: pays in test USDC. Network fee covered.",
  failed: (code: string) => `Payment didn't go through (${code}). Nothing was charged.`,
  etherscan: "See it on Etherscan",
  paidTitle: (amt: string) => `Paid ${amt}`,
  paidTo: (shop: string) => `to ${shop}`,
  receipt: "Receipt",
  sent: "You sent",
  received: "Shop received",
  fee: "Network fee",
  covered: "Covered",
  ref: "Reference",
  done: "Done",
  shopPhone: "See the shop's phone",
  world: "The payment and the shop pseudonym are onchain. Who paid is not linked to you by name.",
};
const payEs: typeof payEn = {
  verified: "Pagá en dólares",
  youPay: "Pagás con",
  swap: (tok: string) => (tok === "USDC" ? "Llega en dólares. La comisión de red la ponemos nosotros." : `${tok} se cambia a dólares con Uniswap. La comisión de red la ponemos nosotros.`),
  pay: (amt: string) => `Pagar ${amt}`,
  enter: "Ingresá un monto",
  paying: "Pagando",
  funding: "Consiguiendo tus dólares de prueba…",
  testUsdc: "Testnet: pagás con USDC de prueba. La comisión de red la ponemos nosotros.",
  failed: (code: string) => `El pago no salió (${code}). No se cobró nada.`,
  etherscan: "Verlo en Etherscan",
  paidTitle: (amt: string) => `Pagaste ${amt}`,
  paidTo: (shop: string) => `a ${shop}`,
  receipt: "Comprobante",
  sent: "Mandaste",
  received: "Recibió el kiosco",
  fee: "Comisión de red",
  covered: "Sin costo",
  ref: "Referencia",
  done: "Listo",
  shopPhone: "Ver el teléfono del kiosco",
  world: "El pago y el seudónimo del kiosco están en la cadena. Quién pagó no queda ligado a tu nombre.",
};
export const payCopy: Record<Lang, typeof payEn> = { en: payEn, es: payEs };

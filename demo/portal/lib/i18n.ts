export type Lang = "es" | "en";

const dict = {
  es: {
    brand: "PagoSur",
    sellers: "Vendedores",
    demo: "Entorno de demostración",
    loginTitle: "Ingresá a tu cuenta de vendedor",
    loginSub: "Cobros, ventas y retiros en un solo lugar.",
    email: "Email",
    password: "Contraseña",
    signIn: "Ingresar",
    signingIn: "Ingresando…",
    demoAccounts: "Cuentas de demostración",
    demoAccountsNote: "Las contraseñas están en el README (solo demo).",
    err_invalid: "Email o contraseña incorrectos.",
    err_csrf: "La sesión del formulario expiró. Intentá de nuevo.",
    err_rate: "Demasiados intentos. Esperá unos minutos.",
    hello: "Hola",
    logout: "Salir",
    available: "Disponible para retirar",
    pending: "A liberar",
    sales30: "Ventas últimos 30 días",
    vsPrev: "vs. 30 días anteriores",
    salesCount: "operaciones",
    chartTitle: "Ventas por semana",
    chartSub: "Últimas 12 semanas · USD",
    weekOf: "Semana del",
    showTable: "Ver como tabla",
    recent: "Actividad reciente",
    payout: "Retiro a cuenta bancaria",
    sale: "Venta",
    m_qr: "Cobro con QR",
    m_card: "Tarjeta",
    m_transfer: "Transferencia",
    m_link: "Link de pago",
    m_bank: "Retiro",
    payoutSettings: "Configuración de retiros",
    destination: "Cuenta destino",
    schedule: "Frecuencia",
    daily: "Diaria (automática)",
    weekly: "Semanal (lunes)",
    holder: "Titular",
    edit: "Modificar",
    accountStatus: "Estado de la cuenta",
    st_active: "Cuenta activa",
    st_suspended: "Cuenta suspendida",
    st_closed: "Cuenta cerrada",
    ageOk: "Antigüedad de 6 meses o más",
    ageNo: "Antigüedad menor a 6 meses",
    band: "Nivel de facturación",
    bandNone: "Sin nivel",
    country: "País",
    suspendedBanner: "Tu cuenta está suspendida. No podés recibir cobros ni retirar dinero. Contactá a soporte.",
    loading: "Cargando…",
    noActivity: "Todavía no hay movimientos.",
    date: "Fecha",
    amount: "Monto",
  },
  en: {
    brand: "PagoSur",
    sellers: "Sellers",
    demo: "Demo environment",
    loginTitle: "Sign in to your seller account",
    loginSub: "Payments, sales and payouts in one place.",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Signing in…",
    demoAccounts: "Demo accounts",
    demoAccountsNote: "Passwords are in the README (demo only).",
    err_invalid: "Wrong email or password.",
    err_csrf: "The form expired. Please try again.",
    err_rate: "Too many attempts. Please wait a few minutes.",
    hello: "Hi",
    logout: "Sign out",
    available: "Available to withdraw",
    pending: "Pending release",
    sales30: "Sales, last 30 days",
    vsPrev: "vs. previous 30 days",
    salesCount: "transactions",
    chartTitle: "Weekly sales",
    chartSub: "Last 12 weeks · USD",
    weekOf: "Week of",
    showTable: "Show as table",
    recent: "Recent activity",
    payout: "Payout to bank account",
    sale: "Sale",
    m_qr: "QR payment",
    m_card: "Card",
    m_transfer: "Bank transfer",
    m_link: "Payment link",
    m_bank: "Payout",
    payoutSettings: "Payout settings",
    destination: "Destination",
    schedule: "Schedule",
    daily: "Daily (automatic)",
    weekly: "Weekly (Mondays)",
    holder: "Account holder",
    edit: "Edit",
    accountStatus: "Account status",
    st_active: "Account active",
    st_suspended: "Account suspended",
    st_closed: "Account closed",
    ageOk: "6+ months on the platform",
    ageNo: "Less than 6 months on the platform",
    band: "Revenue tier",
    bandNone: "No tier",
    country: "Country",
    suspendedBanner: "Your account is suspended. You cannot receive payments or withdraw funds. Please contact support.",
    loading: "Loading…",
    noActivity: "No activity yet.",
    date: "Date",
    amount: "Amount",
  },
} as const satisfies Record<Lang, Record<string, string>>;

export type Dict = Record<keyof (typeof dict)["es"], string>;

export function t(lang: Lang): Dict {
  return dict[lang];
}

export function pickLang(cookie: string | undefined, accountLocale: string | undefined, acceptLanguage: string | null): Lang {
  if (cookie === "es" || cookie === "en") return cookie;
  if (accountLocale === "es" || accountLocale === "en") return accountLocale;
  if (acceptLanguage && /^\s*en\b/i.test(acceptLanguage)) return "en";
  return "es";
}

export function money(cents: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === "es" ? "es-AR" : "en-US", {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
  }).format(cents / 100);
}

export function shortDate(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "es" ? "es-AR" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso));
}

export function dateTime(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "es" ? "es-AR" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(iso));
}

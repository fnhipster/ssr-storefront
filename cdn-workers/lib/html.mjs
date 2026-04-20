const CURRENCY_SYMBOLS = {
  AED: 'د.إ', AFN: '؋', ALL: 'L', AMD: '֏', ANG: 'ƒ', AOA: 'Kz', ARS: '$',
  AUD: 'A$', AWG: 'ƒ', AZN: '₼', BAM: 'KM', BBD: '$', BDT: '৳', BGN: 'лв',
  BHD: '.د.ب', BIF: 'Fr', BMD: '$', BND: '$', BOB: 'Bs.', BRL: 'R$', BSD: '$',
  BTN: 'Nu', BWP: 'P', BYN: 'Br', BZD: '$', CAD: 'CA$', CDF: 'Fr', CHF: 'Fr',
  CLP: '$', CNY: '¥', COP: '$', CRC: '₡', CUP: '$', CVE: '$', CZK: 'Kč',
  DJF: 'Fr', DKK: 'kr', DOP: '$', DZD: 'د.ج', EGP: 'E£', ERN: 'Nfk', ETB: 'Br',
  EUR: '€', FJD: '$', FKP: '£', GBP: '£', GEL: '₾', GHS: '₵', GIP: '£',
  GMD: 'D', GNF: 'Fr', GTQ: 'Q', GYD: '$', HKD: 'HK$', HNL: 'L', HRK: 'kn',
  HTG: 'G', HUF: 'Ft', IDR: 'Rp', ILS: '₪', INR: '₹', IQD: 'ع.د', IRR: '﷼',
  ISK: 'kr', JMD: '$', JOD: 'JD', JPY: '¥', KES: 'KSh', KGS: 'лв', KHR: '៛',
  KMF: 'Fr', KPW: '₩', KRW: '₩', KWD: 'KD', KYD: '$', KZT: '₸', LAK: '₭',
  LBP: 'L£', LKR: '₨', LRD: '$', LSL: 'L', LYD: 'LD', MAD: 'MAD', MDL: 'L',
  MGA: 'Ar', MKD: 'ден', MMK: 'K', MNT: '₮', MOP: 'P', MRU: 'UM', MUR: '₨',
  MVR: 'Rf', MWK: 'MK', MXN: 'MX$', MYR: 'RM', MZN: 'MT', NAD: '$', NGN: '₦',
  NIO: 'C$', NOK: 'kr', NPR: '₨', NZD: 'NZ$', OMR: 'ر.ع.', PAB: 'B/.', PEN: 'S/.',
  PGK: 'K', PHP: '₱', PKR: '₨', PLN: 'zł', PYG: '₲', QAR: 'ر.ق', RON: 'lei',
  RSD: 'din', RUB: '₽', RWF: 'Fr', SAR: 'ر.س', SBD: '$', SCR: '₨', SDG: 'ج.س.',
  SEK: 'kr', SGD: 'S$', SHP: '£', SLL: 'Le', SOS: 'Sh', SRD: '$', STN: 'Db',
  SVC: '₡', SYP: '£', SZL: 'L', THB: '฿', TJS: 'SM', TMT: 'T', TND: 'DT',
  TOP: 'T$', TRY: '₺', TTD: '$', TWD: 'NT$', TZS: 'Sh', UAH: '₴', UGX: 'Sh',
  USD: '$', UYU: '$', UZS: 'лв', VES: 'Bs.S', VND: '₫', VUV: 'Vt', WST: 'T',
  XAF: 'Fr', XCD: '$', XOF: 'Fr', XPF: 'Fr', YER: '﷼', ZAR: 'R', ZMW: 'ZK',
  ZWL: '$',
};

const NO_DECIMALS = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

export function formatPrice(value, currency) {
  if (value == null || !currency) return '';
  if (typeof Intl !== 'undefined') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  }
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  const decimals = NO_DECIMALS.has(currency) ? 0 : 2;
  const formatted = Number(value).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${symbol}${formatted}`;
}

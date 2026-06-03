/** Тип техніки */
export type EquipmentType = string;

/** Локалізовані назви типів техніки */
export const equipmentTypeLabels: Record<string, string> = {
  Екскаватор: "Екскаватор",
  Навантажувач: "Навантажувач",
  Бульдозер: "Бульдозер",
  Кран: "Кран",
  Каток: "Каток",
  Самоскид: "Самоскид",
  Бетонозмішувач: "Бетонозмішувач",
  Генератор: "Генератор",
  Інше: "Інше",
  excavator: "Екскаватор",
  loader: "Навантажувач",
  bulldozer: "Бульдозер",
  crane: "Кран",
  roller: "Каток",
  "dump-truck": "Самоскид",
  "concrete-mixer": "Бетонозмішувач",
  generator: "Генератор",
  other: "Інше",
};

/** Проміжок часу, коли техніка зайнята */
export interface BookedPeriod {
  /** Початок бронювання (ISO 8601) */
  from: string;
  /** Кінець бронювання (ISO 8601) */
  to: string;
  /** Коментар — хто / який проєкт (опціонально) */
  note?: string;
}

/** Характеристики техніки (ключ-значення) */
export interface EquipmentSpec {
  label: string;
  value: string;
}

/** Зображення товару */
export interface EquipmentImage {
  url: string;
  alt: string;
}

/** Основна модель товару */
export interface Equipment {
  /** Унікальний ідентифікатор */
  id: string;
  /** URL-friendly текст (slug) */
  slug: string;
  /** Назва товару */
  name: string;
  /** Бренд (виробник) */
  brand: string;
  /** Тип техніки */
  type: EquipmentType;
  /** Опис товару */
  description: string;
  /** Тип ціни */
  pricingType?: string;
  /** Технічні характеристики */
  specs: EquipmentSpec[];
  /** Зображення */
  images: EquipmentImage[];
  /** Вартість оренди (грн/год) */
  pricePerHour: number;
  /** Чи є товар популярним */
  isPopular: boolean;
  /** Базова адреса техніки для запланованих заявок */
  baseAddress?: string | null;
  /** Широта бази техніки */
  baseLatitude?: number | null;
  /** Довгота бази техніки */
  baseLongitude?: number | null;
  /** Періоди, коли техніка зайнята */
  bookedPeriods: BookedPeriod[];
}

export interface PriceItemTemplate {
  id: string;
  title: string;
  calculationType: string;
  defaultUnit: string | null;
  defaultUnitPrice: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface OrderPriceItemFinance {
  id: string;
  rentOrderId: string;
  templateId: string | null;
  equipmentId: string | null;
  serviceId: string | null;
  title: string;
  calculationType: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  total: number;
  source: string;
  comment: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderPaymentFinance {
  id: string;
  rentOrderId: string;
  executionSessionId: string | null;
  employeeId: string | null;
  employeeName?: string | null;
  amount: number;
  method: string;
  receivedByType: string;
  paidAt: string;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MonobankInvoiceFinance {
  id: string;
  rentOrderId: string;
  invoiceId: string;
  reference: string;
  status: string;
  amountKop: number;
  ccy: number;
  pageUrl: string | null;
  destination: string | null;
  finalAmountKop: number | null;
  failureReason: string | null;
  orderPaymentId: string | null;
  paidAt: string | null;
  monoCreatedDate: string | null;
  monoModifiedDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderExpenseFinance {
  id: string;
  rentOrderId: string;
  executionSessionId: string | null;
  equipmentId: string | null;
  equipmentName?: string | null;
  employeeId: string | null;
  employeeName?: string | null;
  type: string;
  amount: number;
  fuelLiters: number | null;
  fuelPricePerLiter: number | null;
  comment: string | null;
  source: string;
  expenseAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerCompensationFinance {
  id: string;
  rentOrderId: string;
  assignmentId: string | null;
  equipmentId: string | null;
  equipmentName?: string | null;
  employeeId: string | null;
  employeeName?: string | null;
  type: string;
  rate: number | null;
  quantity: number | null;
  actualQuantity: number | null;
  percent: number | null;
  calculatedAmount: number | null;
  finalAmount: number | null;
  status: string;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeSettlementFinance {
  id: string;
  employeeId: string | null;
  employeeName?: string | null;
  fromEmployeeId?: string | null;
  fromEmployeeName?: string | null;
  toEmployeeId?: string | null;
  toEmployeeName?: string | null;
  rentOrderId: string | null;
  amount: number;
  direction: string;
  method: string;
  settledAt: string;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderFinanceSummary {
  calculatedTotal: number;
  agreedTotal: number | null;
  finalAgreedPrice: number | null;
  orderTotal: number;
  clientPaid: number;
  clientDebt: number;
  paymentStatus: string;
  orderExpenses: number;
  employeeCollectedCash: number;
  employeeReportedExpenses: number;
  workerSalary: number;
  workerBalance: number;
  companyOwesEmployee: number;
  employeeOwesCompany: number;
  paidByCompany: number;
  returnedToCompany: number;
  settlementNet: number;
  workerSettlementStatus: string;
  orderProfit: number;
}

export interface RentOrderFinance {
  order: {
    id: string;
    status: string;
    customerName: string;
    customerPhone: string;
    agreedTotal: number | null;
    financeComment: string | null;
    paymentStatus: string;
    workerSettlementStatus: string;
    finalAgreedPrice: number | null;
    finalCashCollected: number | null;
    finalExtraExpenses: number | null;
    managerClosedAt: string | null;
    updatedAt: string;
  };
  priceItems: OrderPriceItemFinance[];
  payments: OrderPaymentFinance[];
  expenses: OrderExpenseFinance[];
  workerCompensations: WorkerCompensationFinance[];
  latestWorkerCompensation: WorkerCompensationFinance | null;
  settlements: EmployeeSettlementFinance[];
  summary: OrderFinanceSummary;
}

export interface EquipmentExpense {
  id: string;
  equipmentId: string | null;
  equipmentName?: string | null;
  type: string;
  expenseDate: string;
  amount: number;
  fuelLiters: number | null;
  fuelPricePerLiter: number | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceSummary {
  income: number;
  expenses: number;
  profit: number;
  fuelExpenses: number;
  fuelPurchasedLiters: number;
  fuelConsumedLiters: number;
  fuelBalanceLiters: number;
  fuelLowBalanceThresholdLiters: number;
  isFuelBalanceLow: boolean;
  maintenanceExpenses: number;
  workerCompensation: number;
  clientDebt: number;
  workerBalance: number;
}

export interface FinanceByEquipmentRow {
  equipmentId: string;
  equipmentName: string;
  ordersCount: number;
  income: number;
  fuelLiters: number;
  fuelExpenses: number;
  maintenanceExpenses: number;
  orderExpenses: number;
  workerCompensation: number;
  totalExpenses: number;
  profit: number;
}

export interface FinanceByServiceRow {
  serviceTitle: string;
  ordersCount: number;
  income: number;
  fuelLiters: number;
  fuelExpenses: number;
  expenses: number;
  profit: number;
}

export interface ClientDebtRow {
  orderId: string;
  customerName: string;
  customerPhone: string;
  serviceTitle: string;
  orderTotal: number;
  clientPaid: number;
  clientDebt: number;
  paymentStatus: string;
  closedAt: string;
}

export interface EmployeeBalanceRow {
  employeeId: string;
  employeeName: string;
  ordersCount: number;
  earned: number;
  receivedFromClients: number;
  reportedExpenses: number;
  paidByCompany: number;
  returnedToCompany: number;
  companyOwesEmployee: number;
  employeeOwesCompany: number;
  balance: number;
  status: string;
}

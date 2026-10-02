import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/**
 * Format currency in IDR — whole rupiah, so server and browser render identically.
 */
export function formatCurrency(amount: number): string {
  return idr.format(amount)
}

/**
 * Format date for display
 */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date))
}

/**
 * Format datetime for display
 */
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date))
}

/**
 * Last calendar day of a month as YYYY-MM-DD. Built from date parts because
 * toISOString() shifts local midnight into the previous UTC day east of UTC.
 */
export function getMonthEndDate(year: number, month: number): string {
  const lastDay = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
}

/**
 * Today's business date (YYYY-MM-DD) in Jakarta. toISOString() is UTC, which
 * still reads as yesterday between 00:00 and 07:00 WIB.
 */
export function getJakartaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

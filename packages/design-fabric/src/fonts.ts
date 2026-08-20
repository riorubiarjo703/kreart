export function fontString(family: string, weight: number, sizePx: number): string {
  return `${weight} ${sizePx}px "${family}"`
}

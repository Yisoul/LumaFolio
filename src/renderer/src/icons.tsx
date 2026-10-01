import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconLibrary = (props: IconProps) => <Icon {...props}><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M3 14l4.5-4.5 4 4L15 10l6 6" /><circle cx="9" cy="8.5" r="1.2" /></Icon>
export const IconDuplicates = (props: IconProps) => <Icon {...props}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Icon>
export const IconAlbums = (props: IconProps) => <Icon {...props}><path d="M4 6a2 2 0 0 1 2-2h1.5l1.2 1.6H18a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M4 10h16" /></Icon>
export const IconSettings = (props: IconProps) => <Icon {...props}><path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h7M15 17h5" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="13" cy="17" r="2" /></Icon>
export const IconPlus = (props: IconProps) => <Icon {...props}><path d="M12 5v14M5 12h14" /></Icon>
export const IconMinus = (props: IconProps) => <Icon {...props}><path d="M5 12h14" /></Icon>
export const IconSearch = (props: IconProps) => <Icon {...props}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></Icon>
export const IconChevronRight = (props: IconProps) => <Icon {...props}><path d="M9 6l6 6-6 6" /></Icon>
export const IconChevronDown = (props: IconProps) => <Icon {...props}><path d="M6 9l6 6 6-6" /></Icon>
export const IconChevronLeft = (props: IconProps) => <Icon {...props}><path d="M15 6l-6 6 6 6" /></Icon>
export const IconFolder = (props: IconProps) => <Icon {...props}><path d="M3 7a2 2 0 0 1 2-2h3.2l1.4 2H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Icon>
export const IconImage = (props: IconProps) => <Icon {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 15l4.5-4.5 4 4L15 11l6 6" /></Icon>
export const IconStar = ({ filled = false, ...props }: IconProps & { filled?: boolean }) => (
  <Icon {...props} fill={filled ? 'currentColor' : 'none'}><path d="M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 9.7l5.4-.8z" /></Icon>
)
export const IconCheck = (props: IconProps) => <Icon {...props} strokeWidth={2.2}><path d="M5 12.5l4.5 4.5L19 7" /></Icon>
export const IconClose = (props: IconProps) => <Icon {...props}><path d="M6 6l12 12M18 6L6 18" /></Icon>
export const IconRefresh = (props: IconProps) => <Icon {...props}><path d="M20 11a8 8 0 1 0-1.6 5.6" /><path d="M20 5v6h-6" /></Icon>
export const IconExpand = (props: IconProps) => <Icon {...props}><path d="M4 9V5h4M20 15v4h-4M15 4h5v5M9 20H4v-5" /></Icon>
export const IconPanelRight = (props: IconProps) => <Icon {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></Icon>
export const IconArrowUp = (props: IconProps) => <Icon {...props}><path d="M12 19V5M6 11l6-6 6 6" /></Icon>
export const IconArrowDown = (props: IconProps) => <Icon {...props}><path d="M12 5v14M6 13l6 6 6-6" /></Icon>
export const IconTrash = (props: IconProps) => <Icon {...props}><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></Icon>
export const IconFilter = (props: IconProps) => <Icon {...props}><path d="M3 5h18l-7 8v6l-4-2v-4z" /></Icon>
export const IconLocation = (props: IconProps) => <Icon {...props}><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" /><circle cx="12" cy="10" r="2.4" /></Icon>
export const IconClock = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5l3 1.8" /></Icon>
export const IconCamera = (props: IconProps) => <Icon {...props}><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.2" /></Icon>

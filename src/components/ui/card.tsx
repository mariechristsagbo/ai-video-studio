import { cn } from '@/lib/utils';
export function Card({className,...props}:React.ComponentProps<'div'>){return <div className={cn('card',className)} {...props}/>;}

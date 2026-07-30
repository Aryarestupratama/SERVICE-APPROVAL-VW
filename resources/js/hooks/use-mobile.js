import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 1024; // samakan dengan lg: di Tailwind

export function useIsMobile() {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
        const onChange = () => setIsMobile(mql.matches);
        mql.addEventListener('change', onChange);
        onChange();
        return () => mql.removeEventListener('change', onChange);
    }, []);

    return isMobile;
}
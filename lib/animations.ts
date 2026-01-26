import { Variants } from "framer-motion";

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } }
};

export const slideUp: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.6, ease: "easeOut" } }
};

export const slideDown: Variants = {
  hidden: { y: -20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.6, ease: "easeOut" } }
};

export const slideLeft: Variants = {
  hidden: { x: 20, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { duration: 0.6, ease: "easeOut" } }
};

export const slideRight: Variants = {
  hidden: { x: -20, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { duration: 0.6, ease: "easeOut" } }
};

export const scaleIn: Variants = {
  hidden: { scale: 0.9, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { duration: 0.4, ease: "easeOut" } }
};

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};

export const expandCollapse: Variants = {
  collapsed: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.3, ease: "easeInOut" }
  },
  expanded: {
    height: "auto",
    opacity: 1,
    transition: { duration: 0.3, ease: "easeInOut" }
  }
};

export const pulseGlow: Variants = {
  glow: {
    boxShadow: [
      "0 0 0 0px rgba(59, 130, 246, 0.4)",
      "0 0 0 10px rgba(59, 130, 246, 0)",
    ],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeOut"
    }
  }
};

export const float: Variants = {
  float: {
    y: [-10, 0, -10],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
};

export const counterAnimation = {
  initial: { scale: 1 },
  animate: { scale: [1, 1.1, 1] },
  transition: { duration: 0.3 }
};

// Scroll-triggered animations
export const scrollReveal = (delay = 0): Variants => ({
  hidden: { y: 50, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 0.6,
      delay,
      ease: "easeOut"
    }
  }
});

// Progress bar animation
export const progressAnimation: Variants = {
  hidden: { width: 0 },
  visible: (progress: number) => ({
    width: `${progress}%`,
    transition: { duration: 1.5, ease: "easeOut" }
  })
};

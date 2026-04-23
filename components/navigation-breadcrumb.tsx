"use client";

import { useMap } from '@/lib/map-context';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './theme-toggle';
import type { AppStep } from '@/lib/types';

const steps: { id: AppStep; label: string }[] = [
  { id: 'select-model', label: 'Mode' },
  { id: 'map-editor', label: 'Editor' },
  { id: 'objectives', label: 'Objectives' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'results', label: 'Results' },
];

export function NavigationBreadcrumb() {
  const { currentStep, setCurrentStep, mapData } = useMap();
  
  const currentIndex = steps.findIndex(s => s.id === currentStep);

  const canNavigateTo = (step: AppStep) => {
    const targetIndex = steps.findIndex(s => s.id === step);
    if (targetIndex <= currentIndex) return true;
    if (!mapData && targetIndex > 0) return false;
    return false;
  };

  return (
    <nav className="flex items-center justify-between py-3 px-4 bg-card border-b border-border">
      {/* Steps */}
      <div className="flex items-center gap-1">
        {steps.map((step, index) => {
          const isActive = currentStep === step.id;
          const isPast = index < currentIndex;
          const canClick = canNavigateTo(step.id);

          return (
            <div key={step.id} className="flex items-center">
              {index > 0 && (
                <div className={cn(
                  "w-4 md:w-6 h-0.5 mx-0.5",
                  isPast ? "bg-primary" : "bg-border"
                )} />
              )}
              <button
                onClick={() => canClick && setCurrentStep(step.id)}
                disabled={!canClick}
                className={cn(
                  "flex items-center gap-1.5 px-2 md:px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  isActive && "bg-primary text-primary-foreground",
                  isPast && !isActive && "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                  !isActive && !isPast && "bg-muted text-muted-foreground",
                  canClick && !isActive && "cursor-pointer hover:opacity-80",
                  !canClick && "cursor-not-allowed opacity-50"
                )}
              >
                <span className={cn(
                  "flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold",
                  isActive && "bg-primary-foreground text-primary",
                  isPast && !isActive && "bg-primary text-primary-foreground",
                  !isActive && !isPast && "bg-muted-foreground/30 text-muted-foreground"
                )}>
                  {index + 1}
                </span>
                <span className="hidden lg:inline">{step.label}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Theme Toggle */}
      <ThemeToggle />
    </nav>
  );
}

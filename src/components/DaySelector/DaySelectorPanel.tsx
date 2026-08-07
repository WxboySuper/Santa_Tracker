import React, { useState, useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { FloatingPanel } from '../Layout';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
// Badge component available for future use
import { selectForecastCycle, setForecastDay, setCycleDate } from '../../store/forecastSlice';
import { DayType } from '../../types/outlooks';
import { cn } from '../../lib/utils';
import {
  hasAnyModifierKey,
  isTypingTarget,
  keyboardShortcutKey,
} from '../../utils/keyboardShortcutKey';

const DAYS: DayType[] = [1, 2, 3, 4, 5, 6, 7, 8];

// Get description for each day type
const getDayDescription = (day: DayType): string => {
  if (day === 1 || day === 2) {
    return 'Tornado, Wind, Hail, Categorical';
  } else if (day === 3) {
    return 'Total Severe, Categorical';
  } else {
    return '15% and 30% only';
  }
};

type ForecastDays = ReturnType<typeof selectForecastCycle>['days'];

// Pure helper: checks whether a given day has any outlook data
const hasDataForDay = (days: ForecastDays, day: DayType): boolean => {
  const outlookDay = days[day];
  if (!outlookDay) return false;
  const { data } = outlookDay;
  const keys = ['tornado', 'wind', 'hail', 'totalSevere', 'day4-8', 'categorical'];
  return keys.some((k) => (data?.[k as keyof typeof data]?.size ?? 0) > 0);
};

// Small presentational control for editing/displaying the cycle date
const CycleDateControl: React.FC<{
  isEditingDate: boolean;
  tempDate: string;
  cycleDate: string;
  onTempDateChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDateSave: () => void;
  onDateCancel: () => void;
  onDateEdit: () => void;
}> = ({ isEditingDate, tempDate, cycleDate, onTempDateChange, onDateSave, onDateCancel, onDateEdit }) => {
  if (isEditingDate) {
    return (
      <div className="flex items-center gap-2 flex-1">
        <Input type="date" value={tempDate} onChange={onTempDateChange} className="h-8 flex-1" />
        <Button size="icon-sm" variant="success" onClick={onDateSave}>✓</Button>
        <Button size="icon-sm" variant="ghost" onClick={onDateCancel}>✕</Button>
      </div>
    );
  }

  return (
    <>
      <span className="text-sm text-muted-foreground">
        {new Date(cycleDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
      </span>
      <Button size="icon-sm" variant="ghost" onClick={onDateEdit}>
        <Calendar className="h-4 w-4" />
      </Button>
    </>
  );
};

// Tabs for day selection (1-8)
const DayTabs: React.FC<{ currentDay: DayType; days: ForecastDays; onDayButtonClick: (e: React.MouseEvent<HTMLButtonElement>) => void }> = ({ currentDay, days, onDayButtonClick }) => (
  <div className="flex-1 grid grid-cols-8 gap-1">
    {DAYS.map((day) => {
      const hasData = hasDataForDay(days, day);
      const isActive = currentDay === day;

      return (
        <Tooltip key={day}>
          <TooltipTrigger asChild>
            <button
              data-day={day}
              onClick={onDayButtonClick}
              className={cn(
                'relative h-8 w-full text-xs font-medium rounded-md transition-all',
                'hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring',
                isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-secondary-foreground'
              )}
            >
              {day}
              {hasData && <span data-testid="day-has-data-marker" className="absolute -top-1 -right-1 h-2 w-2 bg-success rounded-full" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">Day {day}</p>
            <p className="text-xs text-muted-foreground">{getDayDescription(day)}</p>
            <p className="text-xs text-muted-foreground mt-1">Press {day} to select</p>
          </TooltipContent>
        </Tooltip>
      );
    })}
  </div>
);

/** Maps a digit keydown to a forecast day (1-8), or null when the event should be ignored. */
export const getForecastDayFromDigitKeyDown = (event: KeyboardEvent): DayType | null => {
  if (isTypingTarget(event.target)) return null;
  if (hasAnyModifierKey(event)) return null;

  const key = keyboardShortcutKey(event);
  if (!key) return null;

  const num = parseInt(key, 10);
  if (num >= 1 && num <= 8) return num as DayType;
  return null;
};

// Custom hook: listen for number keys 1-8 to select forecast days
const useDayNumberShortcuts = (dispatch: ReturnType<typeof useDispatch>) => {
  useEffect(() => {
    /** Dispatches day selection when the user presses digit keys 1–8. */
    const handleKeyDown = (event: KeyboardEvent) => {
      const day = getForecastDayFromDigitKeyDown(event);
      if (day) dispatch(setForecastDay(day));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch]);
};

// Component for selecting the forecast day and viewing the cycle date in the Outlook mode. It displays the current forecast cycle date with an option to edit it, and a set of tabs for each forecast day (1-8) that users can click to switch between days. Each day tab also indicates whether there is data available for that day, and hovering over the tabs shows a description of the outlook types included for that day.
export const DaySelectorPanel: React.FC = () => {
  const dispatch = useDispatch();
  const forecastCycle = useSelector(selectForecastCycle);
  const { currentDay, days } = forecastCycle;
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [tempDate, setTempDate] = useState(forecastCycle.cycleDate);

  // Note: `hasDataForDay` moved to a top-level pure helper to reduce component complexity

  // Handlers for changing days and editing cycle date
  const handleDayChange = useCallback((day: DayType) => {
    dispatch(setForecastDay(day));
  }, [dispatch]);

  // Handlers for previous/next day buttons
  const handlePrevDay = useCallback(() => {
    if (currentDay > 1) {
      dispatch(setForecastDay((currentDay - 1) as DayType));
    }
  }, [currentDay, dispatch]);

  // Handler for next day button, which increments the current forecast day if it's less than 8. It dispatches the setForecastDay action with the new day value to update the Redux store and switch the forecast view to the selected day.
  const handleNextDay = useCallback(() => {
    if (currentDay < 8) {
      dispatch(setForecastDay((currentDay + 1) as DayType));
    }
  }, [currentDay, dispatch]);

  // Handler for starting the date edit, which sets the temporary date state to the current cycle date and enters the editing mode. This allows the user to modify the cycle date using an input field, and the changes can be saved or canceled.
  const handleDateSave = useCallback(() => {
    dispatch(setCycleDate(tempDate));
    setIsEditingDate(false);
  }, [dispatch, tempDate]);

  // Note: The date input is a simple text field for demonstration. In a real implementation, you might want to use a date picker component for better UX and validation.
  const handleTempDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTempDate(e.target.value);
  }, []);

  const handleCancelDateEdit = useCallback(() => {
    setIsEditingDate(false);
  }, []);

  const handleStartDateEdit = useCallback(() => {
    setTempDate(forecastCycle.cycleDate);
    setIsEditingDate(true);
  }, [forecastCycle.cycleDate]);

  // Handler for day tab button clicks
  const handleDayButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const day = Number(e.currentTarget.dataset.day) as DayType;
    if (Number.isNaN(day)) {
      return;
    }

    handleDayChange(day);
  }, [handleDayChange]);

  // Keyboard shortcuts for day navigation (1-8)
  useDayNumberShortcuts(dispatch);

  return (
    <TooltipProvider>
      <FloatingPanel
        title="Forecast Day"
        position="top-left"
        icon={<Calendar className="h-4 w-4" />}
        minWidth={280}
      >
        <div className="space-y-3">
          {/* Cycle Date */}
          <div className="flex items-center justify-between">
            <CycleDateControl
              isEditingDate={isEditingDate}
              tempDate={tempDate}
              cycleDate={forecastCycle.cycleDate}
              onTempDateChange={handleTempDateChange}
              onDateSave={handleDateSave}
              onDateCancel={handleCancelDateEdit}
              onDateEdit={handleStartDateEdit}
            />
          </div>

          {/* Day Navigation */}
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={handlePrevDay}
              disabled={currentDay === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <DayTabs currentDay={currentDay} days={days} onDayButtonClick={handleDayButtonClick} />

            <Button
              size="icon-sm"
              variant="ghost"
              onClick={handleNextDay}
              disabled={currentDay === 8}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Day Info */}
          <div data-testid="day-description" className="text-xs text-muted-foreground text-center">
            {getDayDescription(currentDay)}
          </div>
        </div>
      </FloatingPanel>
    </TooltipProvider>
  );
};

export default DaySelectorPanel;

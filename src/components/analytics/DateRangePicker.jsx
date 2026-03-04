/**
 * DateRangePicker — Sélection de période avec presets et mode personnalisé
 */

import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

const PRESETS = [
    { label: "Aujourd'hui", days: 0 },
    { label: '7 derniers jours', days: 7 },
    { label: '30 derniers jours', days: 30 },
    { label: '90 derniers jours', days: 90 },
    { label: 'Personnalisé', days: -1 }
];

function getDateDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
}

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

const DateRangePicker = ({ value, onChange }) => {
    const [open, setOpen] = useState(false);
    const [activePreset, setActivePreset] = useState(1); // default: 7 days
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const ref = useRef(null);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handlePresetClick = (index) => {
        setActivePreset(index);
        const preset = PRESETS[index];

        if (preset.days === -1) return; // custom mode, don't fire yet

        const end = getTodayDate();
        const start = preset.days === 0 ? end : getDateDaysAgo(preset.days);
        onChange({ start, end });
        setOpen(false);
    };

    const handleCustomApply = () => {
        if (customStart && customEnd) {
            onChange({ start: customStart, end: customEnd });
            setOpen(false);
        }
    };

    const displayLabel = PRESETS[activePreset]?.label || '7 derniers jours';

    return (
        <div className="analytics-datepicker" ref={ref}>
            <button onClick={() => setOpen(!open)} className="analytics-datepicker-btn">
                <Calendar size={16} />
                <span>{displayLabel}</span>
                <ChevronDown size={14} className={open ? 'rotate' : ''} />
            </button>
            {open && (
                <div className="analytics-datepicker-dropdown">
                    {PRESETS.map((preset, i) => (
                        <button
                            key={i}
                            onClick={() => handlePresetClick(i)}
                            className={`analytics-datepicker-option ${activePreset === i ? 'active' : ''}`}
                        >
                            {preset.label}
                        </button>
                    ))}
                    {activePreset === 4 && (
                        <div className="analytics-datepicker-custom">
                            <div className="analytics-datepicker-custom-row">
                                <label>Du</label>
                                <input
                                    type="date"
                                    value={customStart}
                                    onChange={(e) => setCustomStart(e.target.value)}
                                    className="analytics-datepicker-input"
                                />
                            </div>
                            <div className="analytics-datepicker-custom-row">
                                <label>Au</label>
                                <input
                                    type="date"
                                    value={customEnd}
                                    onChange={(e) => setCustomEnd(e.target.value)}
                                    className="analytics-datepicker-input"
                                />
                            </div>
                            <button
                                onClick={handleCustomApply}
                                disabled={!customStart || !customEnd}
                                className="analytics-datepicker-apply"
                            >
                                Appliquer
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DateRangePicker;

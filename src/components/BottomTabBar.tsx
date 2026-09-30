import type { ComponentType } from "react";
import { Tab } from "../lib/navigation";
import type { IconProps } from "../icons/Icon";
import { AnalyticsIcon } from "../icons/AnalyticsIcon";
import { HistoryIcon } from "../icons/HistoryIcon";
import { SettingsIcon } from "../icons/SettingsIcon";
import { TimerIcon } from "../icons/TimerIcon";

interface Props {
    activeTab: Tab;
    onTabChange: (tab: Tab) => void;
    onCreateNew: () => void;
}

const LEFT_TABS = [
    { tab: Tab.Timers, label: "Timers", icon: TimerIcon },
    { tab: Tab.History, label: "History", icon: HistoryIcon },
] as const;

const RIGHT_TABS = [
    { tab: Tab.Analytics, label: "Analytics", icon: AnalyticsIcon },
    { tab: Tab.Settings, label: "Settings", icon: SettingsIcon },
] as const;

interface TabButtonProps {
    active: boolean;
    label: string;
    icon: ComponentType<IconProps>;
    onClick: () => void;
}

function TabButton({ active, label, icon: IconComponent, onClick }: TabButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={`flex-1 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
                active ? "text-blue-400" : "text-slate-500"
            }`}
        >
            <IconComponent className="icon-lg" />
            <span className="text-xs font-medium">{label}</span>
        </button>
    );
}

export function BottomTabBar({ activeTab, onTabChange, onCreateNew }: Props) {
    return (
        <nav
            aria-label="Tab navigation"
            className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto z-50 bg-slate-900 border-t border-slate-700 flex items-center h-bottom-bar-inset pb-safe-bottom"
        >
            {LEFT_TABS.map(({ tab, label, icon }) => (
                <TabButton
                    key={tab}
                    active={activeTab === tab}
                    label={label}
                    icon={icon}
                    onClick={() => onTabChange(tab)}
                />
            ))}

            <button
                onClick={onCreateNew}
                className="flex-1 flex items-center justify-center cursor-pointer"
                aria-label="Create new timer"
            >
                <span className="bg-blue-600 text-white text-2xl font-bold w-14 h-14 rounded-full flex items-center justify-center active:scale-95 -translate-y-1/2">
                    +
                </span>
            </button>

            {RIGHT_TABS.map(({ tab, label, icon }) => (
                <TabButton
                    key={tab}
                    active={activeTab === tab}
                    label={label}
                    icon={icon}
                    onClick={() => onTabChange(tab)}
                />
            ))}
        </nav>
    );
}

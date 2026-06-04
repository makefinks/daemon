import { useEffect, useMemo, useState } from "react";

import {
	discoverAllSkills,
	getSkillToggles,
	isSkillEnabled,
	setSkillToggles,
} from "../ai/skills/skill-manager";
import { useMenuKeyboard } from "../hooks/use-menu-keyboard";
import { daemonEvents } from "../state/daemon-events";
import { getDaemonManager } from "../state/daemon-state";
import { setEnabledSkillCount } from "../state/stats-store";
import type { AgentSkill } from "../ai/skills/skill-manager";
import type { AppPreferences, SkillToggles } from "../types";
import { COLORS } from "../ui/constants";

interface SkillsMenuProps {
	persistPreferences: (updates: Partial<AppPreferences>) => void;
	onClose: () => void;
}

function truncateText(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text;
	return `${text.slice(0, Math.max(0, maxLen - 1))}…`;
}

export function SkillsMenu({ persistPreferences, onClose }: SkillsMenuProps) {
	const manager = getDaemonManager();
	const [skills, setSkills] = useState<AgentSkill[]>([]);
	const [toggles, setToggles] = useState<SkillToggles>(() => manager.skillToggles ?? getSkillToggles());

	useEffect(() => {
		let cancelled = false;
		void discoverAllSkills().then((discovered) => {
			if (!cancelled) setSkills(discovered);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const sortedSkills = useMemo(() => {
		return [...skills].sort((a, b) => {
			if (a.source !== b.source) return a.source === "built-in" ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
	}, [skills]);

	const { selectedIndex } = useMenuKeyboard({
		itemCount: sortedSkills.length,
		onClose,
		closeOnSelect: false,
		onSelect: (idx) => {
			const skill = sortedSkills[idx];
			if (!skill) return;

			const current = manager.skillToggles ?? getSkillToggles();
			const next: SkillToggles = {
				...current,
				[skill.name]: !isSkillEnabled(skill.name, current),
			};
			manager.skillToggles = next;
			setSkillToggles(next);
			setToggles(next);
			persistPreferences({ skillToggles: next });

			const enabledCount = sortedSkills.filter((s) => isSkillEnabled(s.name, next)).length;
			setEnabledSkillCount(enabledCount);
			daemonEvents.emit("skillTogglesChanged");
		},
	});

	const skillWidth = useMemo(() => {
		const raw = sortedSkills.reduce((max, skill) => Math.max(max, skill.name.length), 0);
		return Math.min(Math.max(raw + 2, 18), 32);
	}, [sortedSkills]);

	const sourceWidth = 8;
	const statusWidth = 6;

	return (
		<box
			position="absolute"
			left={0}
			top={0}
			width="100%"
			height="100%"
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			zIndex={100}
		>
			<box
				flexDirection="column"
				backgroundColor={COLORS.MENU_BG}
				borderStyle="single"
				borderColor={COLORS.MENU_BORDER}
				paddingLeft={2}
				paddingRight={2}
				paddingTop={1}
				paddingBottom={1}
				width="70%"
				minWidth={72}
				maxWidth={150}
			>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.DAEMON_LABEL}>[ SKILLS ]</span>
					</text>
				</box>
				<box marginBottom={1}>
					<text>
						<span fg={COLORS.USER_LABEL}>↑/↓ or j/k to navigate, ENTER to toggle, ESC to close</span>
					</text>
				</box>

				<box marginBottom={1} paddingLeft={1}>
					<text>
						<span fg={COLORS.REASONING_DIM}>
							{`  ${"SKILL".padEnd(skillWidth)} ${"SOURCE".padEnd(sourceWidth)} ${"STATUS".padEnd(statusWidth)} DESCRIPTION`}
						</span>
					</text>
				</box>

				{sortedSkills.length === 0 ? (
					<text>
						<span fg={COLORS.REASONING_DIM}>No skills available.</span>
					</text>
				) : (
					<box flexDirection="column">
						{sortedSkills.map((skill, idx) => {
							const isSelected = idx === selectedIndex;
							const enabled = isSkillEnabled(skill.name, toggles);
							const labelColor = isSelected ? COLORS.DAEMON_LABEL : COLORS.MENU_TEXT;
							const sourceColor = skill.source === "built-in" ? COLORS.DAEMON_TEXT : COLORS.REASONING_DIM;
							const statusColor = enabled ? COLORS.DAEMON_TEXT : COLORS.REASONING_DIM;
							const skillText = truncateText(skill.name, skillWidth).padEnd(skillWidth);
							const sourceText = (skill.source === "built-in" ? "BUILTIN" : "USER").padEnd(sourceWidth);
							const statusText = (enabled ? "ON" : "OFF").padEnd(statusWidth);
							const descriptionText = truncateText(skill.description, 70);

							return (
								<box
									key={skill.name}
									backgroundColor={isSelected ? COLORS.MENU_SELECTED_BG : COLORS.MENU_BG}
									paddingLeft={1}
									paddingRight={1}
								>
									<text>
										<span fg={labelColor}>{isSelected ? "▶ " : "  "}</span>
										<span fg={labelColor}>{skillText}</span>
										<span fg={COLORS.REASONING_DIM}> </span>
										<span fg={sourceColor}>{sourceText}</span>
										<span fg={COLORS.REASONING_DIM}> </span>
										<span fg={statusColor}>{statusText}</span>
										<span fg={COLORS.REASONING_DIM}> {descriptionText}</span>
									</text>
								</box>
							);
						})}
					</box>
				)}
			</box>
		</box>
	);
}

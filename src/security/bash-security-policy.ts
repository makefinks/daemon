import { homedir } from "node:os";

const SENSITIVE_PATHS = [
	"~/.ssh",
	"~/.gnupg",
	"~/.gpg",
	"~/.aws",
	"~/.azure",
	"~/.config/gcloud",
	"~/.kube",
	"~/Library/Application Support/Google/Chrome",
	"~/Library/Application Support/Firefox",
	"~/Library/Application Support/Microsoft Edge",
	"~/Library/Safari",
	"~/.config/google-chrome",
	"~/.config/chromium",
	"~/.mozilla/firefox",
	"~/Library/Keychains",
	"~/.password-store",
	"~/.local/share/keyrings",
	"~/.env",
	"~/.envrc",
	"~/.netrc",
	"~/Downloads",
	"~/Documents",
	"~/Desktop",
	"~/Pictures",
	"~/Movies",
	"~/Music",
	"~/Library/Messages",
	"~/Library/Mail",
	"~/Library/Calendars",
	"~/Library/Contacts",
	"~/Library/Cookies",
	"~/.docker/config.json",
	"~/.npmrc",
	"~/.pypirc",
	"~/.gem/credentials",
	"~/.config/gh",
	"~/.config/hub",
	"~/.bash_history",
	"~/.zsh_history",
	"~/.node_repl_history",
	"~/.python_history",
];

const SENSITIVE_PATH_PATTERNS = [
	/\bid_rsa\b/i,
	/\bid_ed25519\b/i,
	/\bid_ecdsa\b/i,
	/\bid_dsa\b/i,
	/\bauthorized_keys\b/i,
	/\bknown_hosts\b/i,
	/\.pem\b/i,
	/\.key\b/i,
	/private.*key/i,
	/\.env(\.|$)/i,
	/\.envrc\b/i,
	/aws.*credentials/i,
	/aws.*config/i,
	/\bkeychain\b/i,
	/\bkeyring\b/i,
	/\bLogin Data\b/i,
	/\bCookies\b/i,
	/\bWeb Data\b/i,
	/\bsecurity\s+(find|dump|export)/i,
];

const DANGEROUS_COMMANDS = [
	"rm",
	"rmdir",
	"mv",
	"kill",
	"killall",
	"pkill",
	"shutdown",
	"reboot",
	"halt",
	"poweroff",
	"init",
	"systemctl",
	"chmod",
	"chown",
	"chgrp",
	"mkfs",
	"fdisk",
	"dd",
	"format",
	"sudo",
	"su",
	"doas",
	"env",
	"printenv",
	"export",
	"passwd",
	"useradd",
	"userdel",
	"usermod",
	"groupadd",
	"groupdel",
	"visudo",
	"crontab",
	"iptables",
	"ufw",
	"firewall-cmd",
	"mount",
	"umount",
	"fstab",
	"apt-get remove",
	"apt-get purge",
	"apt remove",
	"apt purge",
	"yum remove",
	"yum erase",
	"dnf remove",
	"pacman -R",
	"brew uninstall",
	"npm uninstall -g",
	"pip uninstall",
	"truncate",
	"shred",
	"wipefs",
	">",
	">>",
	"git push --force",
	"git push -f",
	"git reset --hard",
	"git clean -fd",
	"docker rm",
	"docker rmi",
	"docker system prune",
	"kubectl delete",
	"terraform destroy",
	"drop database",
	"drop table",
	"delete from",
	"truncate table",
];

const DANGEROUS_PATTERNS = [
	/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*|\s).*\//i,
	/\brm\s+-rf?\s/i,
	/\bkill\s+-9\b/i,
	/\bsudo\s/i,
	/\bsu\s+-?\s*$/i,
	/\bchmod\s+[0-7]{3,4}\s/i,
	/\bchown\s/i,
	/\bdd\s+if=/i,
	/>\s*\/dev\//i,
	/\|.*\bsh\b/i,
	/\|.*\bbash\b/i,
	/curl.*\|\s*(ba)?sh/i,
	/wget.*\|\s*(ba)?sh/i,
	/eval\s*\$/i,
	/\$\(.*\)/,
	/`.*`/,
	/\benv\s*$/i,
	/\bprintenv\s*$/i,
	/\bexport\s+-p/i,
	/\bset\s*\|/i,
	/echo\s+\$\w*_?(KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS)/i,
];

function expandPath(path: string): string {
	if (path.startsWith("~/")) {
		return path.replace("~", homedir());
	}
	if (path === "~") {
		return homedir();
	}
	return path;
}

function isSensitivePathAccess(command: string): boolean {
	const normalizedCmd = command.trim();
	const home = homedir();

	for (const sensitivePath of SENSITIVE_PATHS) {
		const expandedPath = expandPath(sensitivePath);
		if (normalizedCmd.includes(expandedPath)) {
			return true;
		}
		if (sensitivePath.startsWith("~/") && normalizedCmd.includes(sensitivePath)) {
			return true;
		}
		if (normalizedCmd.includes(sensitivePath.replace("~", "$HOME"))) {
			return true;
		}
	}

	for (const pattern of SENSITIVE_PATH_PATTERNS) {
		if (pattern.test(normalizedCmd)) {
			return true;
		}
	}

	const homeAccessPattern = new RegExp(
		`(cat|less|head|tail|more|bat|grep|rg|awk|sed|find|ls|tree|du)\\s+[^|;]*?(~(?:/[^\\s/]+)?(?:\\s|$)|${home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/[^\\s/]+)?(?:\\s|$))`
	);
	if (homeAccessPattern.test(normalizedCmd)) {
		const allowedHomePaths = [
			"~/projects",
			"~/code",
			"~/dev",
			"~/src",
			"~/repos",
			"~/workspace",
			"~/work",
			"~/.local/bin",
			"~/go",
			"~/bin",
		];
		const isAllowedPath = allowedHomePaths.some((allowed) => {
			const expanded = expandPath(allowed);
			return normalizedCmd.includes(expanded) || normalizedCmd.includes(allowed);
		});
		if (!isAllowedPath) {
			return true;
		}
	}

	return false;
}

function isDangerousCommand(command: string): boolean {
	const normalizedCmd = command.toLowerCase().trim();

	for (const dangerous of DANGEROUS_COMMANDS) {
		if (dangerous.includes(" ")) {
			if (normalizedCmd.includes(dangerous.toLowerCase())) {
				return true;
			}
		} else {
			const wordBoundaryRegex = new RegExp(`\\b${dangerous}\\b`, "i");
			if (wordBoundaryRegex.test(command)) {
				return true;
			}
		}
	}

	for (const pattern of DANGEROUS_PATTERNS) {
		if (pattern.test(command)) {
			return true;
		}
	}

	return false;
}

export { isDangerousCommand, isSensitivePathAccess };

class UpdateChecker {
    constructor() {
        let current = window.electronAPI.app.getVersion();

        this._failed = false;
        this._fail = e => {
            this._failed = true;
            window.electronAPI.ipc.send("log", "note", "UpdateChecker: Could not fetch latest release from GitHub's API.");
            window.electronAPI.ipc.send("log", "debug", `Error: ${e}`);
        };

        fetch("https://api.github.com/repos/yifu001/son-of-anton/releases/latest", {
            headers: {
                "User-Agent": "Son of Anton UpdateChecker"
            }
        })
            .then(res => {
                if (res.status === 404) {
                    this._fail("Got 404 (Not Found) response from server");
                    return null;
                }
                if (!res.ok) {
                    return res.text().then(text => {
                        this._fail(text);
                        return null;
                    });
                }
                return res.json();
            })
            .then(release => {
                if (this._failed || !release) return;

                try {
                    if (release.tag_name.slice(1) === current) {
                        window.electronAPI.ipc.send("log", "info", "UpdateChecker: Running latest version.");
                    } else if (Number(release.tag_name.slice(1).replace(/\./g, "")) < Number(current.replace("-pre", "").replace(/\./g, ""))) {
                        window.electronAPI.ipc.send("log", "info", "UpdateChecker: Running an unreleased, development version.");
                    } else {
                        new Modal({
                            type: "info",
                            title: "New version available",
                            message: `Son of Anton <strong>${release.tag_name}</strong> is now available.<br/>Head over to <a href="#" onclick="window.electronAPI.shell.openExternal('${release.html_url}')">github.com</a> to download the latest version.`
                        });
                        window.electronAPI.ipc.send("log", "info", `UpdateChecker: New version ${release.tag_name} available.`);
                    }
                } catch (e) {
                    this._fail(e);
                }
            })
            .catch(e => {
                this._fail(e);
            });
    }
}

if (typeof window !== 'undefined') window.UpdateChecker = UpdateChecker;
if (typeof module !== 'undefined') module.exports = { UpdateChecker };

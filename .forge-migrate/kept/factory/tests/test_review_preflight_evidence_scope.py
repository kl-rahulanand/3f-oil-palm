"""`forge review` pre-flight reads verify/tests proof at the scope the recorders wrote it.

verify.py and record_test_from_json.py write through proof_path with no explicit
task id: a task run (`forge task start` stamps task_id in the run pointer) records
task-scoped, a story-level run records story-scoped. The pre-flight once read the
story path only, so a fully recorded TASK run could never enter review
("tests.json is not recorded") — seen on a vendored client's third task; a strictly
task-scoped read refuses a story-level run the same way. Both shapes must pass.
"""
from __future__ import annotations

import sys

from test_gates import (  # noqa: F401
    HARNESS, STAGE_TASK, git, head, load_factory_lib, repo, start_stage, write_in_scope,
)
from test_review_lenses_in_parallel import _fake_skill

sys.path.insert(0, str(HARNESS / "factory" / "scripts"))
from forge_cli.review import review_task  # noqa: E402


def _built(repo, tmp_path) -> None:
    start_stage(repo, tmp_path, STAGE_TASK)
    write_in_scope(repo, "src/core.py")
    git(repo, "add", "src/core.py")
    git(repo, "commit", "-qm", "work")


def _record_proof_like_the_recorders(repo):
    lib = load_factory_lib(repo)
    for name, body in (("verify.json", {"ok": True, "commit": head(repo)}),
                       ("tests.json", {"kind": "automated", "commit": head(repo)})):
        # The exact call verify.py / record_test_from_json.py make: no task id,
        # proof_path resolves the active task from the run pointer.
        path = lib.proof_path(repo, "ENG-1", name, for_write=True)
        path.parent.mkdir(parents=True, exist_ok=True)
        lib.dump_json(path, body)
    return lib


def test_preflight_accepts_the_task_scoped_proof_of_a_task_run(repo, tmp_path):
    _built(repo, tmp_path)
    lib = load_factory_lib(repo)
    pointer = lib.load_json(lib.run_state_path(repo), default={})
    pointer["task_id"] = "T1"  # what `forge task start` stamps
    lib.dump_json(lib.run_state_path(repo), pointer)
    _record_proof_like_the_recorders(repo)
    # The proof landed task-scoped, not at the story singleton.
    assert lib.task_evidence_path(repo, "ENG-1", "T1", "verify.json").is_file()
    assert not lib.evidence_path(repo, "ENG-1", "verify.json").is_file()
    outcome = review_task(repo, "T1", skill=str(_fake_skill(tmp_path)), parallel=False)
    assert outcome["blocking"] == 0 and outcome["stamped"] is True


def test_preflight_accepts_the_story_scoped_proof_of_a_story_run(repo, tmp_path):
    _built(repo, tmp_path)
    lib = _record_proof_like_the_recorders(repo)  # no task_id → story-scoped
    assert lib.evidence_path(repo, "ENG-1", "verify.json").is_file()
    outcome = review_task(repo, "T1", skill=str(_fake_skill(tmp_path)), parallel=False)
    assert outcome["blocking"] == 0 and outcome["stamped"] is True

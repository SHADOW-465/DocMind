import numpy as np
from lucent_ml.pipeline.group import group_points, ThemeAssignment


class FakeEmbedder:
    """Deterministic 2-cluster embedding by keyword, no model download."""
    def encode(self, texts):
        vecs = []
        for t in texts:
            tl = t.lower()
            if any(k in tl for k in ("photosynthesis", "chlorophyll", "calvin", "light")):
                vecs.append([1.0, 0.0])
            else:
                vecs.append([0.0, 1.0])
        return np.array(vecs)


def test_group_clusters_and_labels():
    texts = [
        "Photosynthesis converts light to energy.",
        "Chlorophyll absorbs light.",
        "Cellular respiration releases energy.",
        "Glycolysis splits glucose.",
    ]
    result = group_points(texts, embedder=FakeEmbedder())
    assert isinstance(result, ThemeAssignment)
    assert len(result.theme_of) == 4
    # the two photosynthesis texts share a theme; respiration texts share the other
    assert result.theme_of[0] == result.theme_of[1]
    assert result.theme_of[2] == result.theme_of[3]
    assert result.theme_of[0] != result.theme_of[2]
    # every theme has a non-empty label
    assert all(lbl.strip() for lbl in result.labels.values())


def test_group_few_points_single_theme():
    texts = ["only one point here", "and a second"]
    result = group_points(texts, embedder=FakeEmbedder())
    # < 4 points → single "Summary" theme
    assert len(set(result.theme_of)) == 1
    assert list(result.labels.values())[0]

from lucent_ml.pipeline.assemble import merge_line_bboxes


def test_merges_adjacent_boxes_on_same_line():
    # three words on the same text line (similar y), contiguous x
    boxes = [(72.0, 700.0, 100.0, 712.0), (102.0, 700.5, 130.0, 712.0), (132.0, 700.0, 160.0, 712.0)]
    merged = merge_line_bboxes(boxes)
    assert len(merged) == 1
    x0, y0, x1, y1 = merged[0]
    assert x0 == 72.0 and x1 == 160.0
    assert y0 <= 700.0 and y1 >= 712.0


def test_keeps_separate_lines_separate():
    line1 = [(72.0, 700.0, 100.0, 712.0)]
    line2 = [(72.0, 670.0, 140.0, 682.0)]
    merged = merge_line_bboxes(line1 + line2)
    assert len(merged) == 2


def test_empty_returns_empty():
    assert merge_line_bboxes([]) == []

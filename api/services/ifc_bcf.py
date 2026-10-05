"""Build BCF 2.1 .bcfzip files from zoning compliance results."""

from __future__ import annotations

import io
import uuid
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from xml.etree import ElementTree as ET

from schemas.zoning_compliance import (
    ParameterComplianceRow,
    ZoningComplianceResponse,
)

_BCF_AUTHOR = "proyecto-grado-api"
_BCF_TOPIC_TYPE = "Cumplimiento normativo"
_BCF_PRIORITY = "Alta"
_BCF_FOV = 60.0

Vec3 = tuple[float, float, float]


@dataclass(frozen=True)
class _Bbox:
    min_xyz: Vec3
    max_xyz: Vec3

    @property
    def center(self) -> Vec3:
        return (
            (self.min_xyz[0] + self.max_xyz[0]) / 2.0,
            (self.min_xyz[1] + self.max_xyz[1]) / 2.0,
            (self.min_xyz[2] + self.max_xyz[2]) / 2.0,
        )

    @property
    def size(self) -> Vec3:
        return (
            max(self.max_xyz[0] - self.min_xyz[0], 1.0),
            max(self.max_xyz[1] - self.min_xyz[1], 1.0),
            max(self.max_xyz[2] - self.min_xyz[2], 1.0),
        )


@dataclass(frozen=True)
class _Camera:
    position: Vec3
    direction: Vec3
    up: Vec3
    fov: float = _BCF_FOV


def _normalize(v: Vec3) -> Vec3:
    import math

    n = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    if n < 1e-9:
        return (0.0, 0.0, -1.0)
    return (v[0] / n, v[1] / n, v[2] / n)


def _camera_for_kind(kind: str, bbox: _Bbox | None) -> _Camera | None:
    if bbox is None:
        return None
    cx, cy, cz = bbox.center
    sx, sy, sz = bbox.size

    if kind == "ALTURA_MAXIMA":
        return _Camera(
            position=(cx + 1.5 * sx, cy, cz),
            direction=(-1.0, 0.0, 0.0),
            up=(0.0, 0.0, 1.0),
        )
    if kind == "FOS":
        return _Camera(
            position=(cx, cy, bbox.max_xyz[2] + 1.5 * sz),
            direction=(0.0, 0.0, -1.0),
            up=(0.0, 1.0, 0.0),
        )
    if kind == "RETIRO_FRONTAL":
        return _Camera(
            position=(cx, cy - 1.5 * sy, cz),
            direction=(0.0, 1.0, 0.0),
            up=(0.0, 0.0, 1.0),
        )
    iso_pos = (cx + sx, cy - sy, cz + sz)
    direction = _normalize((cx - iso_pos[0], cy - iso_pos[1], cz - iso_pos[2]))
    return _Camera(position=iso_pos, direction=direction, up=(0.0, 0.0, 1.0))


def _topic_title(row: ParameterComplianceRow) -> str:
    measured = (
        "n/d" if row.measured_value is None else f"{row.measured_value} {row.unit}"
    )
    limit = "n/d" if row.limit_value is None else f"{row.limit_value} {row.unit}"
    if row.parameter_kind == "ALTURA_MAXIMA":
        return f"Altura máxima excedida: {measured} / {limit}"
    if row.parameter_kind == "FOS":
        return f"FOS excedido: {measured} / {limit}"
    if row.parameter_kind == "RETIRO_FRONTAL":
        return f"Retiro frontal insuficiente: {measured} / {limit}"
    label = row.parameter_name or row.parameter_kind
    return f"Incumplimiento normativo ({label}): {measured} / {limit}"


def _topic_description(
    row: ParameterComplianceRow,
    *,
    response: ZoningComplianceResponse,
) -> str:
    measured = (
        "n/d" if row.measured_value is None else f"{row.measured_value} {row.unit}"
    )
    limit = "n/d" if row.limit_value is None else f"{row.limit_value} {row.unit}"
    param_label = row.parameter_name or row.parameter_kind
    cumple = "n/d" if row.compliant is None else ("Sí" if row.compliant else "No")
    lines = [
        f"Parámetro: {param_label}",
        f"Valor medido: {measured}",
        f"Límite normativo: {limit}",
        f"Cumple: {cumple}",
        f"Zona: {response.zoning_area_name} (id {response.zoning_area_id})",
        f"Padrón: {response.parcel_id}",
        f"Municipio IMM: {response.municipality_code}",
    ]
    if row.notes:
        lines.append(f"Notas: {row.notes}")
    if row.parameter_kind == "RETIRO_FRONTAL":
        lines.append(
            "Vista: aproximación frontal asumida sobre el eje −Y "
            "(el sistema no resuelve la arista de frente catastral)."
        )
    return "\n".join(lines)


def _xyz(parent: ET.Element, tag: str, vec: Vec3) -> None:
    el = ET.SubElement(parent, tag)
    ET.SubElement(el, "X").text = repr(vec[0])
    ET.SubElement(el, "Y").text = repr(vec[1])
    ET.SubElement(el, "Z").text = repr(vec[2])


def _build_viewpoint_xml(
    *,
    viewpoint_guid: str,
    ifc_building_guid: str | None,
    camera: _Camera | None,
) -> bytes | None:
    if camera is None and not ifc_building_guid:
        return None

    visualization = ET.Element("VisualizationInfo", {"Guid": viewpoint_guid})

    if ifc_building_guid:
        components = ET.SubElement(visualization, "Components")
        selection = ET.SubElement(components, "Selection")
        ET.SubElement(selection, "Component", {"IfcGuid": ifc_building_guid})
        ET.SubElement(components, "Visibility", {"DefaultVisibility": "true"})

    if camera is not None:
        cam = ET.SubElement(visualization, "PerspectiveCamera")
        _xyz(cam, "CameraViewPoint", camera.position)
        _xyz(cam, "CameraDirection", camera.direction)
        _xyz(cam, "CameraUpVector", camera.up)
        ET.SubElement(cam, "FieldOfView").text = repr(camera.fov)

    return bytes(ET.tostring(visualization, encoding="utf-8", xml_declaration=True))


def _build_markup_xml(
    *,
    topic_guid: str,
    title: str,
    description: str,
    creation_date: str,
    ifc_filename: str,
    viewpoint_guid: str | None,
) -> bytes:
    markup = ET.Element("Markup")

    header = ET.SubElement(markup, "Header")
    file_el = ET.SubElement(header, "File", {"IsExternal": "true"})
    ET.SubElement(file_el, "Filename").text = ifc_filename
    ET.SubElement(file_el, "Date").text = creation_date

    topic = ET.SubElement(
        markup,
        "Topic",
        {
            "Guid": topic_guid,
            "TopicType": _BCF_TOPIC_TYPE,
            "TopicStatus": "Open",
        },
    )
    ET.SubElement(topic, "Title").text = title
    ET.SubElement(topic, "Priority").text = _BCF_PRIORITY
    ET.SubElement(topic, "CreationDate").text = creation_date
    ET.SubElement(topic, "CreationAuthor").text = _BCF_AUTHOR
    ET.SubElement(topic, "Description").text = description

    if viewpoint_guid:
        viewpoints = ET.SubElement(markup, "Viewpoints", {"Guid": viewpoint_guid})
        ET.SubElement(viewpoints, "Viewpoint").text = "viewpoint.bcfv"

    return bytes(ET.tostring(markup, encoding="utf-8", xml_declaration=True))


def _build_version_xml() -> bytes:
    version = ET.Element("Version", {"VersionId": "2.1"})
    ET.SubElement(version, "DetailedVersion").text = "2.1"
    return bytes(ET.tostring(version, encoding="utf-8", xml_declaration=True))


def _build_project_xml(response: ZoningComplianceResponse) -> bytes:
    extension = ET.Element("ProjectExtension")
    project = ET.SubElement(
        extension,
        "Project",
        {"ProjectId": response.parcel_id or str(uuid.uuid4())},
    )
    name = f"Validación de zonificación — {response.zoning_area_name}"
    ET.SubElement(project, "Name").text = name
    ET.SubElement(extension, "ExtensionSchema")
    return bytes(ET.tostring(extension, encoding="utf-8", xml_declaration=True))


def build_bcf_zip(
    *,
    response: ZoningComplianceResponse,
    ifc_filename: str = "model.ifc",
    ifc_building_guid: str | None = None,
    bbox_min_max_m: tuple[Vec3, Vec3] | None = None,
) -> bytes:
    """Return .bcfzip bytes containing one topic per non-compliant check.

    ``ifc_building_guid`` and ``bbox_min_max_m`` come from the compliance pass
    (``analyze_ifc_bytes_for_compliance``); either may be ``None`` if the model
    lacks building GUID or mesh-derived bounds.
    """
    bbox = (
        _Bbox(min_xyz=bbox_min_max_m[0], max_xyz=bbox_min_max_m[1])
        if bbox_min_max_m is not None
        else None
    )
    creation_date = datetime.now(UTC).isoformat(timespec="seconds")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("bcf.version", _build_version_xml())
        zf.writestr("project.bcfp", _build_project_xml(response))

        for row in response.parameter_checks:
            if row.compliant is not False:
                continue

            topic_guid = str(uuid.uuid4())
            viewpoint_guid = str(uuid.uuid4())
            camera = _camera_for_kind(row.parameter_kind, bbox)
            viewpoint_xml = _build_viewpoint_xml(
                viewpoint_guid=viewpoint_guid,
                ifc_building_guid=ifc_building_guid,
                camera=camera,
            )

            markup_xml = _build_markup_xml(
                topic_guid=topic_guid,
                title=_topic_title(row),
                description=_topic_description(row, response=response),
                creation_date=creation_date,
                ifc_filename=ifc_filename,
                viewpoint_guid=viewpoint_guid if viewpoint_xml else None,
            )
            zf.writestr(f"{topic_guid}/markup.bcf", markup_xml)
            if viewpoint_xml:
                zf.writestr(f"{topic_guid}/viewpoint.bcfv", viewpoint_xml)

    return buf.getvalue()
